/**
 * Výběr dvojice ke sloučení v adminu (#192 kluby, sloučení běžců): nabídka našeptávače hledá
 * podle id i názvu (bez diakritiky, každé slovo dotazu musí sedět). Čistá logika bez Reactu.
 */

/** Karta vybrané položky pod polem (název, roky, počet startů…). */
export type MergePickCard = {
  title: string;
  lines: string[];
  /** Odkaz na veřejný profil (už s locale). */
  href?: string;
};

export type MergePickOption = {
  id: string;
  /** Hlavní text řádku nabídky (název klubu / jméno běžce). */
  label: string;
  /** Doplněk řádku nabídky (roky, ročník narození…). */
  meta: string;
  /** Další hledatelný text (starší názvy, předchozí jména…). */
  search?: string;
  card: MergePickCard;
};

export const MERGE_PICK_MIN_QUERY = 1;
export const MERGE_PICK_LIMIT = 30;

export function normalizePick(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Nabídka pro zadaný text. Pořadí: přesná shoda id, id začínající dotazem, název začínající
 * dotazem, ostatní podle názvu. `exclude` = id zvolené ve druhém poli (dvojice musí být různá).
 */
export function filterMergeOptions(
  options: readonly MergePickOption[],
  query: string,
  { exclude, limit = MERGE_PICK_LIMIT }: { exclude?: string | null; limit?: number } = {},
): MergePickOption[] {
  const needle = normalizePick(query);
  if (needle.length < MERGE_PICK_MIN_QUERY) return [];
  const tokens = needle.split(/\s+/).filter(Boolean);
  const scored: { option: MergePickOption; label: string; rank: number }[] = [];
  for (const option of options) {
    if (exclude && option.id === exclude) continue;
    const id = normalizePick(option.id);
    const label = normalizePick(option.label);
    const haystack = `${id} ${label} ${normalizePick(option.meta)} ${normalizePick(option.search ?? "")}`;
    if (!tokens.every((token) => haystack.includes(token))) continue;
    const rank =
      id === needle ? 0 : id.startsWith(needle) ? 1 : label.startsWith(tokens[0]) ? 2 : 3;
    scored.push({ option, label, rank });
  }
  return scored
    .sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label, "cs"))
    .slice(0, limit)
    .map((row) => row.option);
}
