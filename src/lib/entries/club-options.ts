import { clubKey, isNoClub, type ClubMergeRef } from "@/lib/clubs/core";

/**
 * Nabídka klubů v přihlášce (Q35). Klub je id v číselníku `cis_klub`, takže nabídka
 * obsahuje všechna id (ne jen kluby letošního ročníku) s nejnovějším názvem.
 *
 * `value` je text, který se po výběru objeví v poli. Server podle něj dohledá id.
 * Když stejný název nese víc id, dostane každé `value` „Název (id)“, aby šlo vybrat
 * konkrétní id a hodnota zůstala jednoznačná.
 *
 * Sloučená id (`mcvv_klub_slouceni`) se nenabízejí samostatně: patří do volby hlavního id
 * s jeho názvem, roky volby pokrývají všechna id (Q37).
 */
export type ClubOption = {
  /** Hlavní id. */
  id: string;
  /** Hlavní id a pod ním sloučená id. */
  ids: string[];
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

export function buildClubOptions(
  rows: readonly ClubOptionRow[],
  merges: readonly ClubMergeRef[] = [],
): ClubOption[] {
  const byId = new Map<string, { id: string; name: string; first: number; last: number }>();
  for (const row of rows) {
    const id = row.id.trim();
    const name = row.name.trim().replace(/\s+/g, " ");
    if (!id || id === "000" || !name || isNoClub(name)) {
      continue;
    }
    const seen = byId.get(clubKey(id));
    if (!seen) {
      byId.set(clubKey(id), { id, name, first: row.year, last: row.year });
      continue;
    }
    if (row.year >= seen.last) {
      seen.name = name;
      seen.last = row.year;
    }
    seen.first = Math.min(seen.first, row.year);
  }
  const mainOf = new Map(merges.map((merge) => [clubKey(merge.clubId), clubKey(merge.mainClubId)]));
  const groups = new Map<string, { main: string; members: string[] }>();
  for (const key of byId.keys()) {
    const main = mainOf.get(key);
    // Hlavní id bez použitelného řádku (např. „bez klubu“): sloučené id zůstane samo.
    const groupKey = main && byId.has(main) ? main : key;
    const group = groups.get(groupKey) ?? { main: groupKey, members: [] };
    if (key !== groupKey) {
      group.members.push(key);
    }
    groups.set(groupKey, group);
  }
  const clubs = [...groups.values()].map(({ main, members }) => {
    const head = byId.get(main)!;
    const merged = members.map((key) => byId.get(key)!).sort((a, b) => a.id.localeCompare(b.id));
    const years = [head, ...merged];
    return {
      id: head.id,
      ids: [head.id, ...merged.map((club) => club.id)],
      name: head.name,
      first: Math.min(...years.map((club) => club.first)),
      last: Math.max(...years.map((club) => club.last)),
    };
  });
  const nameCount = new Map<string, number>();
  for (const club of clubs) {
    nameCount.set(key(club.name), (nameCount.get(key(club.name)) ?? 0) + 1);
  }
  return clubs
    .map((club) => {
      const idText = club.ids.join(" + ");
      const years = club.first === club.last ? `${club.last}` : `${club.first}–${club.last}`;
      return {
        id: club.id,
        ids: club.ids,
        name: club.name,
        value: (nameCount.get(key(club.name)) ?? 0) > 1 ? `${club.name} (${club.id})` : club.name,
        label: `${idText} · ${years}`,
        lastYear: club.last,
      };
    })
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

/** Text pole pro id (např. klub řádku přihlášky), aby odpovídal nabídce. Sloučené id ukáže volbu hlavního id. */
export function clubOptionValue(
  id: string,
  fallbackName: string,
  options: readonly ClubOption[],
): string {
  const wanted = clubKey(id);
  return (
    options.find((option) => option.ids.some((member) => clubKey(member) === wanted))?.value ??
    fallbackName
  );
}
