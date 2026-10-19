export type LightboxDirection = -1 | 1;

/**
 * Next lightbox index in `direction`, or null when navigation is not possible.
 * With `wrap`, stepping past either end cycles around; otherwise ends are hard stops.
 */
export function stepLightboxIndex(
  index: number,
  count: number,
  direction: LightboxDirection,
  wrap = false,
): number | null {
  if (count <= 1 || index < 0 || index >= count) return null;
  const next = index + direction;
  if (next >= 0 && next < count) return next;
  return wrap ? (next + count) % count : null;
}
