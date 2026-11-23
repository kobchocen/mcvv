/**
 * Layout of a stats-table column. Numeric columns stay wide enough for 3-digit
 * values and never wrap or shrink, so figures are not clipped on a narrow screen.
 */
export function statsTableColumnClass(
  index: number,
  numericColumns: readonly number[] | undefined,
  kind: "header" | "cell",
): string {
  const numeric = Boolean(numericColumns?.includes(index));
  const base =
    kind === "header"
      ? "py-2 pr-4 last:pr-0 align-bottom"
      : "py-2.5 pr-4 last:pr-0 text-race-muted";
  if (numeric) {
    return kind === "header"
      ? `${base} min-w-[3.25rem] text-right leading-tight`
      : `${base} min-w-[3.25rem] whitespace-nowrap text-right tabular-nums`;
  }
  if (index === 0) return `${base} whitespace-nowrap`;
  return `${base} min-w-0 break-words`;
}
