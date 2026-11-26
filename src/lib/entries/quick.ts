/**
 * "Rychlá nabídka" on /prihlasky: runners from the user's past applications.
 * Deduplicated by runner id, sorted by surname, then first name (Czech collation),
 * then birth year. Names are stored as "Příjmení Jméno". Namesakes (e.g. father and son)
 * stay separate entries; the button shows the birth year in a tooltip.
 */
const collator = new Intl.Collator("cs", { sensitivity: "base" });

function splitName(name: string): { surname: string; first: string } {
  const trimmed = name.trim().replace(/\s+/g, " ");
  const space = trimmed.indexOf(" ");
  return space === -1
    ? { surname: trimmed, first: "" }
    : { surname: trimmed.slice(0, space), first: trimmed.slice(space + 1) };
}

/** Pořadí rychlé nabídky: příjmení, jméno (česky), ročník narození, id. */
export function compareQuick(a: { id: string; name: string }, b: { id: string; name: string }) {
  const left = splitName(a.name);
  const right = splitName(b.name);
  return (
    collator.compare(left.surname, right.surname) ||
    collator.compare(left.first, right.first) ||
    a.id.slice(0, 4).localeCompare(b.id.slice(0, 4)) ||
    a.id.localeCompare(b.id)
  );
}

export function buildQuickList(
  rows: { id: string; name: string }[],
): { id: string; name: string }[] {
  const unique = [
    ...new Map(rows.map((row) => [row.id, { id: row.id, name: row.name.trim() }])).values(),
  ];
  unique.sort(compareQuick);
  return unique;
}

/**
 * Rozdělí nabídku na zobrazené a skryté účtem (MD-31, `mcvv_user_quick_hidden`).
 * Pořadí zůstává; skryté id, které v nabídce není (běžec je letos přihlášený), se ignoruje.
 */
export function splitQuickHidden<T extends { id: string }>(
  runners: readonly T[],
  hiddenIds: Iterable<string>,
): { visible: T[]; hidden: T[] } {
  const hidden = new Set(hiddenIds);
  return {
    visible: runners.filter((runner) => !hidden.has(runner.id)),
    hidden: runners.filter((runner) => hidden.has(runner.id)),
  };
}

/**
 * Popisek tlačítka: u jmenovců (stejné jméno, jiný běžec – např. otec a syn) i ročník
 * narození, ať jde poznat, koho přidávám nebo skrývám. Ročník = první 4 znaky id.
 */
export function quickLabels(runners: readonly { id: string; name: string }[]): Map<string, string> {
  const counts = new Map<string, number>();
  for (const runner of runners) {
    const key = runner.name.trim().toLocaleLowerCase("cs");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return new Map(
    runners.map((runner) => {
      const name = runner.name.trim();
      const namesake = (counts.get(name.toLocaleLowerCase("cs")) ?? 0) > 1;
      return [runner.id, namesake ? `${name} (${runner.id.slice(0, 4)})` : name];
    }),
  );
}

/** Id běžce v `cis_bezec`: ročník (4 číslice) + 4 znaky (pohlaví a pořadí, výjimečně i písmeno). */
export const QUICK_RUNNER_ID = /^\d{4}[0-9A-Z]{4}$/;

export type QuickRunner = { id: string; name: string; clubId?: string; clubName?: string };

/**
 * Rychlé přidání předvyplní klub z poslední přihlášky běžce (Q35): id klubu z nejnovějšího
 * ročníku. Řádky bez klubu („000“ nebo prázdný název) se přeskočí, pak platí výchozí klub
 * přihlášky.
 */
export function withLastClub(
  runners: readonly { id: string; name: string }[],
  lines: readonly { runnerId: string; year: number; clubId: string; clubName: string }[],
): QuickRunner[] {
  const last = new Map<string, { year: number; clubId: string; clubName: string }>();
  for (const line of lines) {
    const clubId = line.clubId.trim();
    const clubName = line.clubName.trim();
    if (!clubId || clubId === "000" || !clubName) {
      continue;
    }
    const seen = last.get(line.runnerId);
    if (!seen || line.year > seen.year) {
      last.set(line.runnerId, { year: line.year, clubId, clubName });
    }
  }
  return runners.map((runner) => {
    const club = last.get(runner.id);
    return club ? { ...runner, clubId: club.clubId, clubName: club.clubName } : { ...runner };
  });
}
