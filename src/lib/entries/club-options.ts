import { isNoClub } from "@/lib/clubs/core";

/**
 * Nabídka klubů v přihlášce (Q35). Klub je id v číselníku `cis_klub`, takže nabídka
 * obsahuje všechna id (ne jen kluby letošního ročníku) s nejnovějším názvem.
 *
 * `value` je text, který se po výběru objeví v poli. Server podle něj dohledá id.
 * Když stejný název nese víc id, dostane každé `value` „Název (id)“, aby šlo vybrat
 * konkrétní id a hodnota zůstala jednoznačná.
 */
export type ClubOption = {
  id: string;
  name: string;
  value: string;
  /** Popisek v nabídce: id a roky, kdy se id v číselníku vyskytuje. */
  label: string;
  lastYear: number;
};

export type ClubOptionRow = { id: string; year: number; name: string };

const collator = new Intl.Collator("cs", { sensitivity: "base" });

function key(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLocaleLowerCase("cs");
}

export function buildClubOptions(rows: readonly ClubOptionRow[]): ClubOption[] {
  const byId = new Map<string, { name: string; first: number; last: number }>();
  for (const row of rows) {
    const id = row.id.trim();
    const name = row.name.trim().replace(/\s+/g, " ");
    if (!id || id === "000" || !name || isNoClub(name)) {
      continue;
    }
    const seen = byId.get(id);
    if (!seen) {
      byId.set(id, { name, first: row.year, last: row.year });
      continue;
    }
    if (row.year >= seen.last) {
      seen.name = name;
      seen.last = row.year;
    }
    seen.first = Math.min(seen.first, row.year);
  }
  const nameCount = new Map<string, number>();
  for (const club of byId.values()) {
    nameCount.set(key(club.name), (nameCount.get(key(club.name)) ?? 0) + 1);
  }
  return [...byId.entries()]
    .map(([id, club]) => ({
      id,
      name: club.name,
      value: (nameCount.get(key(club.name)) ?? 0) > 1 ? `${club.name} (${id})` : club.name,
      label:
        club.first === club.last ? `${id} · ${club.last}` : `${id} · ${club.first}–${club.last}`,
      lastYear: club.last,
    }))
    .sort(
      (a, b) =>
        collator.compare(a.name, b.name) || b.lastYear - a.lastYear || a.id.localeCompare(b.id),
    );
}

/** Volba z nabídky podle textu v poli: přesná shoda s `value` (bez ohledu na velikost písmen). */
export function findClubOption(
  text: string,
  options: readonly ClubOption[],
): ClubOption | undefined {
  const wanted = key(text);
  if (!wanted) {
    return undefined;
  }
  return options.find((option) => key(option.value) === wanted);
}

/** Text pole pro id (např. klub řádku přihlášky), aby odpovídal nabídce. */
export function clubOptionValue(
  id: string,
  fallbackName: string,
  options: readonly ClubOption[],
): string {
  return options.find((option) => option.id === id.trim())?.value ?? fallbackName;
}
