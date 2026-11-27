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
import { formatCountdown, parseCorridor, type Corridor } from "./starter-core";

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

/** Odpočet na dlaždici: do hodiny `−4:59`, do dne „za 3 h 34 min“, dál jen datum startu. */
export type PrestartCountdown =
  | { kind: "clock"; text: string }
  | { kind: "hours"; hours: number; minutes: number; past: boolean }
  | { kind: "date"; at: number };

const DAY_MS = 24 * 3_600_000;

/**
 * Formát odpočtu do plánovaného startu (#379, STG 27. 11.): dlouhý odpočet `−214:47:07`
 * rozházel řádek dlaždice. Do hodiny zůstávají minuty a sekundy (`−4:59`, po startu `+0:03`),
 * do 24 h hodiny a minuty, dál jen datum startu.
 */
export function prestartCountdown(remainingMs: number, plannedMs: number): PrestartCountdown {
  const past = remainingMs <= 0;
  const seconds = Math.round(Math.abs(remainingMs) / 1000);
  if (seconds < 3600) {
    return { kind: "clock", text: `${past ? "+" : "−"}${formatCountdown(seconds)}` };
  }
  if (seconds < DAY_MS / 1000) {
    const totalMinutes = Math.floor(seconds / 60);
    return {
      kind: "hours",
      hours: Math.floor(totalMinutes / 60),
      minutes: totalMinutes % 60,
      past,
    };
  }
  return { kind: "date", at: plannedMs };
}
