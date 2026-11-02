/**
 * Našeptávač partnera („spolu s“, Q231): vlastní combobox v dialogu spec. startu. Nabídka =
 * přihlášení běžci ročníku; formulář posílá jen id běžce (skryté pole `partner`).
 */
export type PartnerOption = {
  runnerId: string;
  name: string;
  birthYear: string;
  clubName: string;
  /** Startovní číslo, když už je přidělené. */
  bib: number | null;
};

/** Nejmenší počet znaků, od kterého se nabídka zobrazí. */
export const PARTNER_MIN_QUERY = 2;

/** Popis běžce do pole našeptávače: „Novák Jan · 1983 · SK Kopec“. */
export function partnerOptionLabel(option: Pick<PartnerOption, "name" | "birthYear" | "clubName">) {
  return [option.name, option.birthYear, option.clubName].filter(Boolean).join(" · ");
}

/** Malá písmena bez diakritiky – „Šťastná“ najde i „stastna“. */
export function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Nabídka pro zadaný text: každé slovo dotazu musí být ve jméně, ročníku, klubu, čísle nebo id.
 * Kratší dotaz než `PARTNER_MIN_QUERY` nevrací nic. Nejdřív shoda na začátku jména, pak podle
 * jména.
 */
export function filterPartnerOptions(
  options: readonly PartnerOption[],
  query: string,
  { exclude, limit = 8 }: { exclude?: string; limit?: number } = {},
): PartnerOption[] {
  const needle = normalizeSearch(query);
  if (needle.length < PARTNER_MIN_QUERY) {
    return [];
  }
  const tokens = needle.split(/\s+/).filter(Boolean);
  const scored: { option: PartnerOption; name: string; prefix: boolean }[] = [];
  for (const option of options) {
    if (option.runnerId === exclude) {
      continue;
    }
    const name = normalizeSearch(option.name);
    const haystack = [
      name,
      option.birthYear,
      normalizeSearch(option.clubName),
      option.bib != null ? String(option.bib) : "",
      option.runnerId,
    ].join(" ");
    if (tokens.every((token) => haystack.includes(token))) {
      scored.push({ option, name, prefix: name.startsWith(tokens[0]) });
    }
  }
  return scored
    .sort(
      (a, b) =>
        Number(b.prefix) - Number(a.prefix) ||
        a.name.localeCompare(b.name, "cs") ||
        a.option.runnerId.localeCompare(b.option.runnerId),
    )
    .slice(0, limit)
    .map((item) => item.option);
}

/** Id partnera z formuláře: osmimístné id (skryté pole), starší tvar „… [id]“ také projde. */
export function partnerIdFromInput(raw: string): string | null {
  const value = raw.trim();
  const bracketed = /\[(\d{8})\]\s*$/.exec(value);
  if (bracketed) {
    return bracketed[1];
  }
  return /^\d{8}$/.test(value) ? value : null;
}
