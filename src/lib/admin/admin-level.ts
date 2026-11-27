/**
 * Úroveň přístupu do administrace jedním místem (čisté funkce, bez Next.js a DB).
 *
 * Kolečko v hlavičce, stráž layoutu `/admin` i cíl po přihlášení musí rozhodovat stejně,
 * jinak vzniká smyčka „/admin → přihlášení → /admin“ (prázdná stránka, Pavel 26. 11.).
 * - Vypnutý `permissions.v2`: dnešní `adminAccess(role)` (v náhledu nejvyšší z vybraných rolí).
 * - Zapnutý `permissions.v2`: rozcestník má účet, který smí číst aspoň jednu sekci
 *   (`v2HasAdminHome`); jednotlivé stránky si právo hlídají samy (403), proto `full`.
 */
import { v2HasAdminHome, type Overrides } from "@/lib/admin/permissions";
import { adminAccess, type AdminAccess, type UserRole } from "@/lib/auth/roles";
import type { StaffRole } from "@/lib/auth/staff-roles";

export type AdminLevelInput = {
  v2: boolean;
  /** Role účtu (sloupec `mcvv_user.role`, v náhledu role náhledu); null = nepřihlášený. */
  role: UserRole | null;
  grants: readonly StaffRole[];
  overrides?: Overrides;
  /** Náhled při vypnutém flagu: vybrané dnešní role. */
  previewLegacyRoles?: readonly UserRole[];
};

const ORDER: readonly AdminAccess[] = ["none", "tools", "raceday", "full"];

export function adminLevelOf(input: AdminLevelInput): AdminAccess {
  if (!input.role) return "none";
  if (input.v2) return v2HasAdminHome(input.grants, input.overrides) ? "full" : "none";
  if (input.previewLegacyRoles) {
    return input.previewLegacyRoles
      .map(adminAccess)
      .reduce<AdminAccess>(
        (best, level) => (ORDER.indexOf(level) > ORDER.indexOf(best) ? level : best),
        "none",
      );
  }
  return adminAccess(input.role);
}
