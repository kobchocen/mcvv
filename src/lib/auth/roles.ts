/**
 * Role účtů a jejich oprávnění (čisté funkce, bez frameworku a DB).
 *
 * - `registrar` – běžný přihlašující (výchozí role po registraci),
 * - `organizer` – pořadatel, plná administrace kromě nastavení a správy uživatelů,
 * - `admin` – vše včetně nastavení a správy rolí,
 * - `timing` – „Časomíra“ (externí dodavatel OBD): jen sekce „Den závodu“
 *   (export podkladů pro OBD, importy z OBD),
 * - `splitmaker` – obsluha mezičasových kontrol: žádná administrace, jen stránka
 *   mezičasů (#121), kterou spouští podle role.
 *
 * Oprávnění se vynucují na serveru (stránky, server actions, route handlery) přes
 * `src/lib/admin/staff.ts`; tady je jen jejich definice, aby šla testovat.
 */

export const USER_ROLES = ["registrar", "organizer", "admin", "timing", "splitmaker"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export function isUserRole(value: unknown): value is UserRole {
  return typeof value === "string" && (USER_ROLES as readonly string[]).includes(value);
}

/** Plná administrace (organizer, admin). */
export function isStaffRole(role: UserRole): boolean {
  return role === "organizer" || role === "admin";
}

/** Sekce „Den závodu“ (export pro OBD, importy z OBD). */
export function canAccessRaceDay(role: UserRole): boolean {
  return role === "timing" || isStaffRole(role);
}

/** Zadávání mezičasů na kontrolách (#121). */
export function canAccessSplits(role: UserRole): boolean {
  return role === "splitmaker" || isStaffRole(role);
}

/** Úroveň přístupu do /admin: plná, jen „Den závodu“, nebo žádná. */
export type AdminAccess = "full" | "raceday" | "none";

export function adminAccess(role: UserRole): AdminAccess {
  if (isStaffRole(role)) return "full";
  if (canAccessRaceDay(role)) return "raceday";
  return "none";
}

export const RACE_DAY_PATH = "/admin/den-zavodu";

/** Kam vede odkaz „Administrace“ v hlavičce. */
export function adminHomeHref(role: UserRole): string {
  return adminAccess(role) === "raceday" ? RACE_DAY_PATH : "/admin";
}

/** Smí účet s danou úrovní přístupu otevřít admin cestu (bez locale, bez query)? */
export function adminPathAllowed(access: AdminAccess, path: string): boolean {
  if (access === "full") return path === "/admin" || path.startsWith("/admin/");
  if (access === "raceday") return path === RACE_DAY_PATH || path.startsWith(`${RACE_DAY_PATH}/`);
  return false;
}

/**
 * Přihlášení bez ověřeného e-mailu smí jen plný staff (účty zakládá seed).
 * Nové omezené role (`timing`, `splitmaker`) ověřený e-mail potřebují stejně jako `registrar`.
 */
export function requiresVerifiedEmail(role: UserRole): boolean {
  return !isStaffRole(role);
}

export type RoleChangeError =
  "invalid_role" | "same_role" | "self_change" | "last_admin" | "unverified";

/**
 * Pojistky změny role (volá se v transakci se skutečným počtem adminů).
 * - admin nemůže měnit roli sám sobě (nezamkne se),
 * - nelze odebrat posledního admina,
 * - privilegovanou roli (cokoli kromě `registrar`) jen účtu s ověřeným e-mailem.
 */
export function validateRoleChange(input: {
  actorId: number;
  target: { id: number; role: UserRole; emailVerified: boolean };
  newRole: unknown;
  adminCount: number;
}): { ok: true; role: UserRole } | { ok: false; error: RoleChangeError } {
  const { actorId, target, newRole, adminCount } = input;
  if (!isUserRole(newRole)) return { ok: false, error: "invalid_role" };
  if (newRole === target.role) return { ok: false, error: "same_role" };
  if (target.id === actorId) return { ok: false, error: "self_change" };
  if (target.role === "admin" && adminCount <= 1) return { ok: false, error: "last_admin" };
  if (newRole !== "registrar" && !target.emailVerified) return { ok: false, error: "unverified" };
  return { ok: true, role: newRole };
}
