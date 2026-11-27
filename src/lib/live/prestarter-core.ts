/**
 * Předstartér (#379, obrazovka `/predstarter`) – čistá logika přístupu bez DB a prohlížeče.
 *
 * Předstartér řadí závodníky do koridoru a označuje připravené. Zapisuje stejný záznam startu
 * (`mcvv_start_check`) jako startér, se zdrojem `prestart` a stejnou prioritou (platí pozdější
 * ťuknutí, admin vždy vyhraje). Vidí a označuje jen frontu svého koridoru – pole „Jiné číslo“
 * nemá (Pavel 26. 11.).
 *
 * Ve svém koridoru smí všechno jako startér (Pavel 27. 11.): zrušit i označení od startéra,
 * odstartovat v červené fázi a potvrdit pozdní start z „Neodstartovali“. Proto obě obrazovky
 * sdílejí `tapAction` / `decideStarterWrite` bez výjimek pro zdroj `prestart`.
 */
import type { UserRole } from "@/lib/auth/roles";
import type { StaffRole } from "@/lib/auth/staff-roles";

import type { StarterAccess } from "./starter-api-core";
import { parseCorridor, type Corridor } from "./starter-core";

/**
 * Má účet roli Předstartér? Platí hlavní sloupec `mcvv_user.role` i grant v `mcvv_user_role`,
 * a to při zapnutém i vypnutém `permissions.v2`.
 */
export function hasPrestarterRole(
  role: UserRole,
  grants: readonly StaffRole[] | readonly string[] = [],
): boolean {
  return role === "prestarter" || grants.includes("prestarter");
}

/**
 * Přiřazuje se účtu koridor (`mcvv_user.start_corridor`)? Startér i předstartér, hlavní role
 * i grant v `mcvv_user_role`.
 */
export function hasStartCorridorRole(
  role: UserRole,
  grants: readonly StaffRole[] | readonly string[] = [],
): boolean {
  return role === "starter" || grants.includes("starter") || hasPrestarterRole(role, grants);
}

/**
 * Koho pustit na obrazovku předstartéra a s jakým koridorem: předstartér jen svůj přiřazený
 * koridor (bez přiřazení nic), řízení startu (pořadatel, admin) libovolný s přepínačem.
 * Na rozdíl od startéra se zápisy vždy omezí na zobrazený koridor (`allowed`), protože
 * obrazovka označuje jen svou frontu.
 */
export function prestarterAccessFor(
  scope: { any: boolean; own: boolean },
  assigned: Corridor | null,
  requested: unknown,
): StarterAccess {
  if (scope.any) {
    const corridor = parseCorridor(requested) ?? assigned ?? 1;
    return { ok: true, corridor, allowed: corridor, canSwitch: true };
  }
  if (scope.own) {
    return assigned
      ? { ok: true, corridor: assigned, allowed: assigned, canSwitch: false }
      : { ok: false, error: "no-corridor" };
  }
  return { ok: false, error: "forbidden" };
}
