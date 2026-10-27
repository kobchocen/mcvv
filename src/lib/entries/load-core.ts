/** Výběr vlastních přihlášek z lehkého indexu (čisté funkce, bez DB) – #189. */

function emailMatch(value: string | null | undefined, email: string): boolean {
  return value?.trim().toLowerCase() === email.toLowerCase();
}

/** Klíče vlastních přihlášek z minulých (i budoucích) ročníků – vše kromě `year`. */
export function pastRegistrationKeys(
  index: readonly { year: number; id: number; email: string | null }[],
  year: number,
  email: string,
): { year: number; id: number }[] {
  return index
    .filter((row) => row.year !== year && emailMatch(row.email, email))
    .map((row) => ({ year: row.year, id: row.id }));
}
