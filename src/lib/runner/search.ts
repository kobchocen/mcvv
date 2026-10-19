import { displayRunnerName } from "@/lib/format/runner-name";

/** Case- and diacritics-insensitive form used to compare names with a search query. */
export function foldName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("cs")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Label for a runner search hit. A hit on the current name shows it as is; a hit that
 * only matched a former name stored on an older result (e.g. a maiden name) shows the
 * profile format "Zvěřinová (Dočkalová) Martina" so the user sees why it matched.
 */
export function searchHitName(
  query: string,
  currentName: string,
  storedNames: readonly (string | null | undefined)[],
): string {
  const q = foldName(query);
  if (!q || foldName(currentName).includes(q)) {
    return currentName;
  }
  const former = storedNames.find((name) => name && foldName(name).includes(q));
  return (former && displayRunnerName(former, currentName)) || currentName;
}
