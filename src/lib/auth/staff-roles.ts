/**
 * Role účtů pro víc rolí a matici oprávnění (návrh administrace v2, P3).
 *
 * Kódy se ukládají do `mcvv_user_role.role` (VARCHAR) a validují se tady. Závodník je
 * implicitní (každý účet) a do tabulky se nezapisuje. Admin má vždy vše.
 *
 * Dokud je vypnuté nastavení `permissions.v2`, rozhoduje dál `mcvv_user.role`
 * (`roles.ts`) a tyhle kódy se jen připravují.
 */
import type { UserRole } from "./roles";

export const STAFF_ROLES = [
  "admin",
  /** Přechodná role pro dnešní pořadatele: přesně dnešní přístup `organizer`. */
  "organizer_legacy",
  "entries",
  "startlist",
  "comms",
  "content",
  "data",
  "speaker",
  /** Měření (PR-3), nahrazuje `timing`. */
  "timing_ops",
  /** Hlavní rozhodčí (PR-3). */
  "chief_referee",
  /** Šéf trati (#316). */
  "course_chief",
  "starter",
  /** Předstartér (#379): mobilní obrazovka fronty koridoru. */
  "prestarter",
  "splitmaker",
  "race_office",
  "resultboard",
] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export function isStaffRoleCode(value: unknown): value is StaffRole {
  return typeof value === "string" && (STAFF_ROLES as readonly string[]).includes(value);
}

/** Role odvozené z dnešního sloupce `mcvv_user.role` (stejně jako backfill v migraci P3). */
export function grantsFromLegacyRole(role: UserRole): StaffRole[] {
  switch (role) {
    case "registrar":
      return [];
    case "organizer":
      return ["organizer_legacy"];
    case "timing":
      return ["timing_ops"];
    default:
      return [role];
  }
}

/** Klíč nastavení (`mcvv_setting`), které zapíná nový model oprávnění. Výchozí vypnuto. */
export const PERMISSIONS_V2_KEY = "permissions.v2";

/** Hodnota nastavení → zapnuto? Zapíná jen přesně "1" (cokoli jiného = vypnuto). */
export function permissionsV2On(value: string | null | undefined): boolean {
  return value?.trim() === "1";
}

/**
 * Hlavní role pro dnešní sloupec `mcvv_user.role` z víc rolí (P5): kvůli kódu, který role
 * zatím čte ze sloupce (přepnutý flag vypnutý, cookie, e-maily). Nové role bez protějšku
 * = registrar (přístup jim dává jen engine oprávnění).
 */
export function primaryLegacyRole(grants: readonly StaffRole[]): UserRole {
  if (grants.includes("admin")) return "admin";
  if (grants.includes("organizer_legacy")) return "organizer";
  if (grants.includes("timing_ops")) return "timing";
  if (grants.includes("race_office")) return "race_office";
  if (grants.includes("starter")) return "starter";
  if (grants.includes("prestarter")) return "prestarter";
  if (grants.includes("splitmaker")) return "splitmaker";
  if (grants.includes("resultboard")) return "resultboard";
  return "registrar";
}

export type GrantsChangeError =
  "invalid_role" | "same_role" | "self_change" | "last_admin" | "unverified";

/** Ověření změny sady rolí (stejné pojistky jako u jedné role). */
export function validateGrantsChange(input: {
  actorId: number;
  target: { id: number; role: UserRole; emailVerified: boolean };
  current: readonly StaffRole[];
  next: readonly unknown[];
  adminCount: number;
}): { ok: true; grants: StaffRole[]; role: UserRole } | { ok: false; error: GrantsChangeError } {
  const { actorId, target, current, next, adminCount } = input;
  if (!next.every(isStaffRoleCode)) return { ok: false, error: "invalid_role" };
  const grants = STAFF_ROLES.filter((role) => next.includes(role));
  const same =
    grants.length === new Set(current).size && grants.every((role) => current.includes(role));
  if (same) return { ok: false, error: "same_role" };
  if (target.id === actorId) return { ok: false, error: "self_change" };
  const role = primaryLegacyRole(grants);
  if (target.role === "admin" && role !== "admin" && adminCount <= 1) {
    return { ok: false, error: "last_admin" };
  }
  if (grants.length > 0 && !target.emailVerified) return { ok: false, error: "unverified" };
  return { ok: true, grants, role };
}
