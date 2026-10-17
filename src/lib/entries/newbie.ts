/**
 * A runner is a "nováček" (newbie) when they have no result in any other year.
 * Past applications without a result (e.g. did not start) do not matter.
 */
export function isNewbie(pastStarts: number): boolean {
  return pastStarts === 0;
}
