import { forbidden } from "next/navigation";
import { getLocale } from "next-intl/server";

import { adminAccess, canAccessRaceDay, isStaffRole, type UserRole } from "@/lib/auth/roles";
import { getSession, type SessionUser } from "@/lib/auth/session";
import { redirect } from "@/i18n/routing";

/**
 * Serverové stráže administrace. Volají se v každé admin stránce, server action
 * i route handleru (layout sám nestačí: server action jde zavolat přímým POSTem).
 *
 * - Nepřihlášený nebo účet bez jakéhokoli přístupu do administrace → přihlášení
 *   (dosavadní chování).
 * - Přihlášený účet s omezenou rolí (`timing`), který nemá oprávnění k dané akci → 403.
 */
async function requireRole(allowed: (role: UserRole) => boolean): Promise<SessionUser> {
  const session = await getSession();
  if (!session || adminAccess(session.role) === "none") {
    const locale = await getLocale();
    redirect({ href: "/prihlaseni", locale });
  }
  if (!allowed(session!.role)) {
    forbidden();
  }
  return session!;
}

/** Plná administrace: organizer, admin. */
export async function requireStaff(): Promise<SessionUser> {
  return requireRole(isStaffRole);
}

/** Jen admin (nastavení, správa uživatelů). Organizer je přesměrován na dashboard. */
export async function requireAdmin(): Promise<SessionUser> {
  const session = await requireStaff();
  if (session.role !== "admin") {
    const locale = await getLocale();
    redirect({ href: "/admin", locale });
  }
  return session;
}

/** Sekce „Den závodu“: timing (Časomíra), organizer, admin. */
export async function requireRaceDay(): Promise<SessionUser> {
  return requireRole(canAccessRaceDay);
}

/**
 * Varianta pro route handlery: místo přesměrování vrací HTTP odpověď 401/403.
 */
export async function raceDayAccess(): Promise<
  { ok: true; session: SessionUser } | { ok: false; response: Response }
> {
  const session = await getSession();
  const headers = { "Cache-Control": "private, no-store" };
  if (!session) {
    return { ok: false, response: new Response("Unauthorized", { status: 401, headers }) };
  }
  if (!canAccessRaceDay(session.role)) {
    return { ok: false, response: new Response("Forbidden", { status: 403, headers }) };
  }
  return { ok: true, session };
}
