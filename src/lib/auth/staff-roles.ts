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
  "splitmaker",
  "race_office",
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
