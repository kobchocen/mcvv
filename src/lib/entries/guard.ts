/**
 * Serverová pojistka uzávěrky: měnit přihlášku (přidat/odebrat běžce, změnit klub či hlavičku)
 * smí přihlašující jen u přihlášky AKTUÁLNÍHO ročníku a jen do konce dne uzávěrky.
 *
 * Dřív akce kontrolovaly jen `open` aktuálního ročníku, ne rok z formuláře. Přímým POSTem
 * s `year` jiného ročníku šlo přidat běžce do loňské přihlášky (když je letos otevřeno),
 * nebo – jakmile admin založí další ročník – do přihlášky ročníku už po uzávěrce.
 */
export type RaceYearState = { year: number; open: boolean };

export function entryWritable(current: RaceYearState, year: number | null): boolean {
  return year !== null && current.open && year === current.year;
}
