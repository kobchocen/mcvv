"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { notifyRoleChange } from "@/lib/admin/role-change-notify";
import type { RoleChange, RoleChangeMailOutcome } from "@/lib/admin/role-change-mail";
import { requireAdmin } from "@/lib/admin/staff";
import { writeAudit } from "@/lib/audit/log";
import { isUserRole, validateRoleChange, type RoleChangeError } from "@/lib/auth/roles";
import { prisma } from "@/lib/db/client";
import { parseCorridor } from "@/lib/live/starter-core";
import { redirect } from "@/i18n/routing";

type Outcome =
  { ok: true; change: RoleChange } | { ok: false; error: RoleChangeError | "not_found" };

/**
 * Změna role účtu (jen admin, vynuceno zde – ne jen v UI). Pojistky (poslední admin,
 * vlastní účet, ověřený e-mail) se kontrolují v transakci se zamčenými řádky adminů,
 * takže dva souběžní admini nemohou odebrat oba poslední admin účty. Každá změna
 * se zapíše do auditu. Nová role platí hned (getSession čte roli z DB).
 * Po commitu dostane uživatel e-mail o změně role (#191) přes e-mailovou frontu; chyba
 * odeslání změnu role neblokuje, jen se zobrazí adminovi (`mail` v query).
 */
export async function changeUserRole(formData: FormData): Promise<void> {
  const actor = await requireAdmin();
  const locale = await getLocale();
  const userId = Number.parseInt(String(formData.get("userId") ?? ""), 10);
  const newRole = String(formData.get("role") ?? "");
  const back = String(formData.get("back") ?? "");

  let outcome: Outcome = { ok: false, error: "not_found" };
  if (Number.isSafeInteger(userId) && userId > 0) {
    outcome = await prisma.$transaction(async (tx): Promise<Outcome> => {
      // Zamknout adminy (a cílový účet), ať je počet adminů platný až do commitu.
      await tx.$queryRaw`SELECT id FROM mcvv_user WHERE role = 'admin' OR id = ${userId} FOR UPDATE`;
      const target = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, name: true, role: true, emailVerified: true },
      });
      if (!target || !isUserRole(target.role)) {
        return { ok: false, error: "not_found" };
      }
      const adminCount = await tx.user.count({ where: { role: "admin" } });
      const check = validateRoleChange({
        actorId: actor.id,
        target: { id: target.id, role: target.role, emailVerified: Boolean(target.emailVerified) },
        newRole,
        adminCount,
      });
      if (!check.ok) {
        return { ok: false, error: check.error };
      }
      await tx.user.update({ where: { id: target.id }, data: { role: check.role } });
      await writeAudit(
        {
          actor,
          action: "user.role_change",
          target: `user:${target.id}`,
          detail: { email: target.email, from: target.role, to: check.role },
        },
        tx,
      );
      return {
        ok: true,
        change: { email: target.email, name: target.name, from: target.role, to: check.role },
      };
    });
  }

  // Až po commitu: e-mail nesmí změnu role zablokovat ani vrátit (notifyRoleChange nevyhazuje).
  let mail: RoleChangeMailOutcome | null = null;
  if (outcome.ok) {
    mail = await notifyRoleChange(outcome.change, locale).catch(() => "failed" as const);
  }

  revalidatePath("/[locale]/admin/uzivatele", "page");
  const query: Record<string, string> = Object.fromEntries(
    new URLSearchParams(/^[\w%=&+.@-]*$/.test(back) ? back : ""),
  );
  delete query.saved;
  delete query.error;
  delete query.mail;
  if (outcome.ok) {
    query.saved = String(userId);
    if (mail) query.mail = mail;
  } else {
    query.error = outcome.error;
  }
  redirect({ href: { pathname: "/admin/uzivatele", query }, locale });
}

function backQuery(back: string): Record<string, string> {
  const query: Record<string, string> = Object.fromEntries(
    new URLSearchParams(/^[\w%=&+.@-]*$/.test(back) ? back : ""),
  );
  delete query.saved;
  delete query.error;
  delete query.mail;
  delete query.corridor;
  return query;
}

/**
 * Přiřazení startovního koridoru účtu s rolí Startér (jen admin). Prázdná hodnota koridor
 * odebere (startér pak obrazovku /start neotevře). Změna se zapíše do auditu.
 */
export async function changeStartCorridor(formData: FormData): Promise<void> {
  const actor = await requireAdmin();
  const locale = await getLocale();
  const userId = Number.parseInt(String(formData.get("userId") ?? ""), 10);
  const raw = String(formData.get("corridor") ?? "");
  const corridor = raw === "" ? null : parseCorridor(raw);
  const query = backQuery(String(formData.get("back") ?? ""));

  let ok = false;
  if (Number.isSafeInteger(userId) && userId > 0 && (raw === "" || corridor !== null)) {
    ok = await prisma.$transaction(async (tx) => {
      const target = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, role: true, startCorridor: true },
      });
      if (!target || target.role !== "starter") return false;
      if (target.startCorridor === corridor) return true;
      await tx.user.update({ where: { id: target.id }, data: { startCorridor: corridor } });
      await writeAudit(
        {
          actor,
          action: "user.start_corridor_change",
          target: `user:${target.id}`,
          detail: { email: target.email, from: target.startCorridor, to: corridor },
        },
        tx,
      );
      return true;
    });
  }

  revalidatePath("/[locale]/admin/uzivatele", "page");
  if (ok) query.corridor = String(userId);
  else query.error = "not_found";
  redirect({ href: { pathname: "/admin/uzivatele", query }, locale });
}
