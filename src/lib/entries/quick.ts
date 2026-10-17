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

export function buildQuickList(
  rows: { id: string; name: string }[],
): { id: string; name: string }[] {
  const unique = [
    ...new Map(rows.map((row) => [row.id, { id: row.id, name: row.name.trim() }])).values(),
  ];
  unique.sort((a, b) => {
    const left = splitName(a.name);
    const right = splitName(b.name);
    return (
      collator.compare(left.surname, right.surname) ||
      collator.compare(left.first, right.first) ||
      a.id.slice(0, 4).localeCompare(b.id.slice(0, 4)) ||
      a.id.localeCompare(b.id)
    );
  });
  return unique;
}
