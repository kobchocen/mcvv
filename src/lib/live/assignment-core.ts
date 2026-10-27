import { isStaffRole, type UserRole } from "@/lib/auth/roles";

import { FINISH_SPLIT, isStationCode, type Station } from "./stations";

/**
 * Přiřazení splitmakera ke stanovišti (čisté funkce). Uloženo v `mcvv_user.split_stations`
 * jako řetězec kódů ("1", "13", "0" = start). Admin a organizer smí na všechna stanoviště, splitmaker
 * jen na přiřazená (a jen ta, která jsou v `live_stations`), ostatní role nikam.
 */

/** Kódy z uloženého řetězce: platné kódy stanovišť a start (bez cíle 9), bez duplicit, seřazené. */
export function parseAssignment(raw: string | null | undefined): string[] {
  return [...new Set((raw ?? "").split(""))]
    .filter((code) => isStationCode(code) && code !== FINISH_SPLIT)
    .sort();
}

/** Uložitelný řetězec (max. 8 kódů), prázdný výběr → null. */
export function formatAssignment(codes: readonly string[]): string | null {
  const value = parseAssignment(codes.join("")).join("").slice(0, 8);
  return value || null;
}

/** Výběr z formuláře omezený na nabízená stanoviště. */
export function assignmentFromForm(picked: readonly string[], stations: Station[]): string | null {
  const offered = new Set(stations.map((s) => s.code));
  return formatAssignment(picked.filter((code) => offered.has(code)));
}

/** Stanoviště, na která smí účet zapisovat (pro /mezicasy i pro server). */
export function allowedStationsFor(
  role: UserRole,
  assigned: string | null | undefined,
  stations: Station[],
): Station[] {
  if (isStaffRole(role)) return stations;
  if (role !== "splitmaker") return [];
  const codes = new Set(parseAssignment(assigned));
  return stations.filter((station) => codes.has(station.code));
}
