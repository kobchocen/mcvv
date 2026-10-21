"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireAdmin } from "@/lib/admin/staff";
import { writeAudit } from "@/lib/audit/log";
import { isUserRole, validateRoleChange, type RoleChangeError } from "@/lib/auth/roles";
import { prisma } from "@/lib/db/client";
import { redirect } from "@/i18n/routing";

type Outcome = "ok" | RoleChangeError | "not_found";

/**
 * Změna role účtu (jen admin, vynuceno zde – ne jen v UI). Pojistky (poslední admin,
 * vlastní účet, ověřený e-mail) se kontrolují v transakci se zamčenými řádky adminů,
 * takže dva souběžní admini nemohou odebrat oba poslední admin účty. Každá změna
 * se zapíše do auditu. Nová role platí hned (getSession čte roli z DB).
 */
export async function changeUserRole(formData: FormData): Promise<void> {
  const actor = await requireAdmin();
  const locale = await getLocale();
  const userId = Number.parseInt(String(formData.get("userId") ?? ""), 10);
  const newRole = String(formData.get("role") ?? "");
  const back = String(formData.get("back") ?? "");

  let outcome: Outcome = "not_found";
  if (Number.isSafeInteger(userId) && userId > 0) {
    outcome = await prisma.$transaction(async (tx): Promise<Outcome> => {
      // Zamknout adminy (a cílový účet), ať je počet adminů platný až do commitu.
      await tx.$queryRaw`SELECT id FROM mcvv_user WHERE role = 'admin' OR id = ${userId} FOR UPDATE`;
      const target = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, role: true, emailVerified: true },
      });
      if (!target || !isUserRole(target.role)) {
        return "not_found";
      }
      const adminCount = await tx.user.count({ where: { role: "admin" } });
      const check = validateRoleChange({
        actorId: actor.id,
        target: { id: target.id, role: target.role, emailVerified: Boolean(target.emailVerified) },
        newRole,
        adminCount,
      });
      if (!check.ok) {
        return check.error;
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
      return "ok";
    });
  }

  revalidatePath("/[locale]/admin/uzivatele", "page");
  const query: Record<string, string> = Object.fromEntries(
    new URLSearchParams(/^[\w%=&+.@-]*$/.test(back) ? back : ""),
  );
  delete query.saved;
  delete query.error;
  if (outcome === "ok") {
    query.saved = String(userId);
  } else {
    query.error = outcome;
  }
  redirect({ href: { pathname: "/admin/uzivatele", query }, locale });
}
