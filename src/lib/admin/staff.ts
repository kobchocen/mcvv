import { headers } from "next/headers";
import { forbidden } from "next/navigation";
import { getLocale } from "next-intl/server";

import { REQUEST_PATH_HEADER } from "@/lib/auth/admin-gate";
import { loginHref } from "@/lib/auth/login-next";
import { safeNext } from "@/lib/auth/safe-next";

import { adminAccess, canAccessRaceDay, isStaffRole, type UserRole } from "@/lib/auth/roles";
import { getSession, type SessionUser } from "@/lib/auth/session";
import { NO_STORE } from "@/lib/http/no-store";
import { redirect } from "@/i18n/routing";

/**
 * Serverové stráže administrace. Volají se v každé admin stránce, server action
 * i route handleru (layout sám nestačí: server action jde zavolat přímým POSTem).
 *
 * - Nepřihlášený nebo účet bez jakéhokoli přístupu do administrace → přihlášení
 *   s `next=<původní cesta>` (cestu předává `src/proxy.ts`; nepřihlášené přesměruje
 *   už proxy skutečným 307, sem dojde např. účet, kterému mezitím vzali roli).
 * - Přihlášený účet s omezenou rolí (`timing`), který nemá oprávnění k dané akci → 403.
 */
async function requireRole(allowed: (role: UserRole) => boolean): Promise<SessionUser> {
  const session = await getSession();
  if (!session || adminAccess(session.role) === "none") {
    const locale = await getLocale();
    const next = safeNext((await headers()).get(REQUEST_PATH_HEADER));
    redirect({ href: loginHref(next), locale });
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

export type RouteAccess = { ok: true; session: SessionUser } | { ok: false; response: Response };

/**
 * Varianta stráží pro route handlery: místo přesměrování vrací HTTP odpověď.
 * Nepřihlášený → 401; přihlášený bez oprávnění → `forbidden` (výchozí 403).
 */
async function routeAccess(
  allowed: (role: UserRole) => boolean,
  forbidden: { status: number; body: string } = { status: 403, body: "Forbidden" },
): Promise<RouteAccess> {
  const session = await getSession();
  if (!session) {
    return {
      ok: false,
      response: new Response("Unauthorized", { status: 401, headers: NO_STORE }),
    };
  }
  if (!allowed(session.role)) {
    return {
      ok: false,
      response: new Response(forbidden.body, { status: forbidden.status, headers: NO_STORE }),
    };
  }
  return { ok: true, session };
}

/** Route handlery „Den závodu“ (export / importy OBD): timing, organizer, admin. */
export async function raceDayAccess(): Promise<RouteAccess> {
  return routeAccess(canAccessRaceDay);
}

/**
 * Route handlery jen pro plnou administraci (organizer, admin) – tiskové sestavy a PDF.
 * `forbidden` zachovává dosavadní odpověď konkrétní cesty (tisk 404, PDF startovky 401).
 */
export async function staffAccess(forbidden?: {
  status: number;
  body: string;
}): Promise<RouteAccess> {
  return routeAccess(isStaffRole, forbidden);
}
