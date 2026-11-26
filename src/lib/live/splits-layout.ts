/**
 * Desktopové rozložení Mezičasů (#380): jen notebook, ne 10" tablet.
 *
 * Zapne se od šířky 1200 px a zároveň jemného pointeru (myš / trackpad).
 * 10" tablet na šířku (typicky 1024×768, hrubý pointer) zůstává u mobilního
 * rozložení s displejovou klávesnicí.
 */
export const DESKTOP_SPLITS_MIN_WIDTH_PX = 1200;
export const DESKTOP_SPLITS_QUERY = `(min-width: ${DESKTOP_SPLITS_MIN_WIDTH_PX}px) and (pointer: fine)`;

export function isDesktopSplitsLayout(widthPx: number, finePointer: boolean): boolean {
  return finePointer && widthPx >= DESKTOP_SPLITS_MIN_WIDTH_PX;
}

/** Spodní hranice, když výšku ještě neznáme nebo je řádek nesmyslný. */
export const RECENT_LIMIT_DESKTOP_FALLBACK = 12;
/** Bezpečný strop, ať seznam ani na velmi vysokém displeji nenabobtná. */
export const RECENT_LIMIT_DESKTOP_MAX = 80;
/**
 * Odhad výšky jednoho sbaleného řádku na desktopu (písmo + padding + mezera).
 * Skutečnou výšku si klient po vykreslení přeměří.
 */
export const DESKTOP_RECENT_ROW_ESTIMATE_PX = 56;

/**
 * Kolik posledních průchodů se vejde do dostupné výšky.
 * `rowHeightPx` je rozteč řádku (výška + mezera). Počet se počítá, není pevný.
 */
export function recentVisibleLimit(
  availableHeightPx: number,
  rowHeightPx: number,
  options?: { min?: number; max?: number; fallback?: number },
): number {
  const min = options?.min ?? 1;
  const max = options?.max ?? RECENT_LIMIT_DESKTOP_MAX;
  const fallback = options?.fallback ?? RECENT_LIMIT_DESKTOP_FALLBACK;
  if (!Number.isFinite(rowHeightPx) || rowHeightPx <= 0) return fallback;
  if (!Number.isFinite(availableHeightPx) || availableHeightPx <= 0) return fallback;
  return Math.min(max, Math.max(min, Math.floor(availableHeightPx / rowHeightPx)));
}
