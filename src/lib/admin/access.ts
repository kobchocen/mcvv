import { forbidden } from "next/navigation";
import { headers } from "next/headers";
import { getLocale } from "next-intl/server";
import { cache } from "react";

import {
  adminRouteAccess,
  requireAdmin,
  requireRaceDay,
  requireRole,
  requireStaff,
  routeAccess,
  staffAccess,
  type RouteAccess,
} from "@/lib/admin/staff";
import {
  LEGACY_PREDICATES,
  legacyAllows,
  legacyGuard,
  overrideKey,
  v2Allows,
  v2HasAdminHome,
  type AccessLevel,
  type Overrides,
  type SectionId,
  type StoredLevel,
} from "@/lib/admin/permissions";
import { REQUEST_PATH_HEADER } from "@/lib/auth/admin-gate";
import { loginHref } from "@/lib/auth/login-next";
import { hasAdminHome } from "@/lib/auth/roles";
import { safeNext } from "@/lib/auth/safe-next";
import { getSession, type SessionUser } from "@/lib/auth/session";
import {
  grantsFromLegacyRole,
  isStaffRoleCode,
  PERMISSIONS_V2_KEY,
  permissionsV2On,
  type StaffRole,
} from "@/lib/auth/staff-roles";
import { prisma } from "@/lib/db/client";
import { NO_STORE } from "@/lib/http/no-store";
import { redirect } from "@/i18n/routing";

/**
 * Přístup aktuálního účtu (jednou za request). Při vypnutém `permissions.v2` (výchozí)
 * nebo při chybě DB platí dnešní role (`v2: false`) – chování je beze změny.
 */
export type Access = {
  session: SessionUser | null;
  v2: boolean;
  grants: StaffRole[];
  overrides: Overrides;
};

/** Přepínač se čte z DB nejvýš jednou za 15 s na repliku (API mezičasů je na trati časté). */
const FLAG_TTL_MS = 15_000;
let flagCache: { value: boolean; at: number } | null = null;

async function readFlag(): Promise<boolean> {
  const now = Date.now();
  if (flagCache && now - flagCache.at < FLAG_TTL_MS) return flagCache.value;
  try {
    const row = await prisma.setting.findUnique({ where: { key: PERMISSIONS_V2_KEY } });
    const value = permissionsV2On(row?.text);
    flagCache = { value, at: now };
    return value;
  } catch (error) {
    console.error("[access] permissions.v2 flag read failed – using legacy roles", error);
    return false;
  }
}

export const getAccess = cache(async (): Promise<Access> => {
  const session = await getSession();
  const v2 = session ? await readFlag() : false;
  if (!session || !v2) {
    return { session, v2: false, grants: [], overrides: new Map() };
  }
  try {
    const [rows, matrix] = await Promise.all([
      prisma.userRoleGrant.findMany({ where: { userId: session.id }, select: { role: true } }),
      prisma.roleSection.findMany({ select: { role: true, sectionId: true, level: true } }),
    ]);
    const stored = rows.map((row) => row.role).filter(isStaffRoleCode);
    // Účet, který v nové tabulce ještě nemá řádky, dostane role odvozené ze sloupce role.
    const grants = stored.length ? stored : grantsFromLegacyRole(session.role);
    const overrides = new Map<string, StoredLevel>();
    for (const row of matrix) {
      if (row.level === "none" || row.level === "read" || row.level === "write") {
        overrides.set(overrideKey(row.role, row.sectionId), row.level);
      }
    }
    return { session, v2: true, grants, overrides };
  } catch (error) {
    console.error("[access] role grants read failed – using legacy roles", error);
    return { session, v2: false, grants: [], overrides: new Map() };
  }
});

/** Smí účet sekci číst / upravovat? */
export function can(access: Access, id: SectionId, level: AccessLevel): boolean {
  if (!access.session) return false;
  if (!access.v2) return legacyAllows(access.session.role, id, level);
  return v2Allows(access.grants, id, level, access.overrides);
}

/** Zkratka: `can` pro aktuální účet. */
export async function canAccess(id: SectionId, level: AccessLevel): Promise<boolean> {
  return can(await getAccess(), id, level);
}

/** `can` jako callback pro čisté funkce (`splitScope`, `starterScope`). */
export function allowsFor(access: Access): (id: SectionId, level: AccessLevel) => boolean {
  return (id, level) => can(access, id, level);
}

/** Má účet kolečko a rozcestník administrace? */
export function canOpenAdmin(access: Access): boolean {
  if (!access.session) return false;
  if (!access.v2) return hasAdminHome(access.session.role);
  return v2HasAdminHome(access.grants, access.overrides);
}

/**
 * Stráž stránky nebo server action pro sekci. Při vypnutém flagu volá přesně dnešní stráž
 * (`requireStaff` / `requireAdmin` / `requireRaceDay` …), takže se chování nemění.
 * Se zapnutým flagem: bez přístupu do administrace → přihlášení, bez práva → 403.
 */
export async function requireSection(id: SectionId, level: AccessLevel): Promise<SessionUser> {
  const access = await getAccess();
  if (!access.v2) {
    const guard = legacyGuard(id, level);
    if (guard === "staff") return requireStaff();
    if (guard === "admin") return requireAdmin();
    if (guard === "raceday") return requireRaceDay();
    return requireRole(LEGACY_PREDICATES[guard]);
  }
  if (!canOpenAdmin(access)) {
    const locale = await getLocale();
    const next = safeNext((await headers()).get(REQUEST_PATH_HEADER));
    redirect({ href: loginHref(next), locale });
  }
  if (!can(access, id, level)) {
    forbidden();
  }
  return access.session!;
}

/** Varianta pro route handlery (401 / 403 místo přesměrování). */
export async function sectionRouteAccess(
  id: SectionId,
  level: AccessLevel,
  forbiddenResponse?: { status: number; body: string },
): Promise<RouteAccess> {
  const access = await getAccess();
  if (!access.v2) {
    const guard = legacyGuard(id, level);
    if (guard === "staff") return staffAccess(forbiddenResponse);
    if (guard === "admin" && !forbiddenResponse) return adminRouteAccess();
    return routeAccess(LEGACY_PREDICATES[guard], forbiddenResponse);
  }
  if (!access.session) {
    return {
      ok: false,
      response: new Response("Unauthorized", { status: 401, headers: NO_STORE }),
    };
  }
  if (!can(access, id, level)) {
    const denied = forbiddenResponse ?? { status: 403, body: "Forbidden" };
    return {
      ok: false,
      response: new Response(denied.body, { status: denied.status, headers: NO_STORE }),
    };
  }
  return { ok: true, session: access.session };
}
