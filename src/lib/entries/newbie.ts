/**
 * A runner is a "nováček" (newbie) only when they have no result from another year
 * and were never entered in a previous year (some past entries have no result, e.g. DNS).
 */
export function isNewbie(pastStarts: number, wasEnteredBefore: boolean): boolean {
  return pastStarts === 0 && !wasEnteredBefore;
}
