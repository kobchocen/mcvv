// Navigátor sekcí dlouhých stránek adminu (P10). Čistá logika bez DOM, kvůli testům.

export type SectionNavItem = Readonly<{ id: string; label: string }>;

/** Odsazení shora (px): sekce je „aktivní“, jakmile její nadpis přejede tuto čáru. */
export const SECTION_NAV_OFFSET = 120;

const ID_RE = /^[a-z][a-z0-9-]{0,62}$/;

/** Jen platná, unikátní id (kotvy jsou sdílitelné odkazy, např. /admin/nastaveni#maily). */
export function sectionNavItems(items: readonly SectionNavItem[]): SectionNavItem[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (!ID_RE.test(item.id) || seen.has(item.id) || !item.label.trim()) return false;
    seen.add(item.id);
    return true;
  });
}

/**
 * Aktivní sekce podle pozic nadpisů vůči viewportu: poslední, jejíž horní hrana je nad čárou;
 * na úplném konci stránky poslední sekce; před první sekcí první.
 */
export function activeSection(
  positions: readonly Readonly<{ id: string; top: number }>[],
  offset = SECTION_NAV_OFFSET,
  atBottom = false,
): string | null {
  if (positions.length === 0) return null;
  if (atBottom) return positions[positions.length - 1]!.id;
  let active = positions[0]!.id;
  for (const position of positions) {
    if (position.top <= offset) active = position.id;
  }
  return active;
}

/** Kotva z URL (#id) → id sekce, pokud na stránce existuje. */
export function hashSection(hash: string, items: readonly SectionNavItem[]): string | null {
  const id = decodeURIComponent(hash.replace(/^#/, ""));
  return items.some((item) => item.id === id) ? id : null;
}
