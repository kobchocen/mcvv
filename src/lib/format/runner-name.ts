/**
 * Display name for a result row. Results store the runner's name as it was in that
 * year (`bezec_name`); the runner (`cis_bezec.jmeno`) holds the current name.
 * Names are "Příjmení Jméno". When only the surname changed (e.g. after marriage),
 * show "Vetchá (Stránská) Adéla"; when more differs, show "Current (Stored)".
 */
export function displayRunnerName(
  stored: string | null | undefined,
  current: string | null | undefined,
): string | null {
  const s = normalize(stored);
  const c = normalize(current);
  if (!s) return c || null;
  if (!c || s.toLocaleLowerCase("cs") === c.toLocaleLowerCase("cs")) return s;

  const [sSurname, ...sRest] = s.split(" ");
  const [cSurname, ...cRest] = c.split(" ");
  const sFirst = sRest.join(" ");
  const cFirst = cRest.join(" ");
  if (sFirst && sFirst.toLocaleLowerCase("cs") === cFirst.toLocaleLowerCase("cs")) {
    return `${cSurname} (${sSurname}) ${cFirst}`;
  }
  return `${c} (${s})`;
}

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ");
}
