/**
 * Shared category rules (server + client, no DB access).
 *
 * Age is always `raceYear - birthYear` (civil year, not birthday).
 * - `age === 0`: open category (any age of the given sex).
 * - `age <= 20` (youth): runner's age must be at most `age` (e.g. žáci 14 => born raceYear-14 or later).
 * - `age > 20` (veterans): runner's age must be at least `age`.
 */
export type CategoryRule = { sex: string; age: number };

export const YOUTH_MAX_AGE = 20;

function isYouth(category: CategoryRule): boolean {
  return category.age > 0 && category.age <= YOUTH_MAX_AGE;
}

export function isEligibleByBirthYear(
  birthYear: number,
  sex: string,
  raceYear: number,
  category: CategoryRule,
): boolean {
  if (category.sex !== sex) {
    return false;
  }
  if (!Number.isFinite(birthYear) || birthYear < 1920 || birthYear > raceYear) {
    return false;
  }
  if (category.age === 0) {
    return true;
  }
  const age = raceYear - birthYear;
  return isYouth(category) ? age <= category.age : age >= category.age;
}

export function eligibleCategoriesFor<T extends CategoryRule>(
  birthYear: number,
  sex: string,
  raceYear: number,
  categories: T[],
): T[] {
  return categories.filter((category) => isEligibleByBirthYear(birthYear, sex, raceYear, category));
}

/**
 * Most specific category among eligible ones:
 * youth => the youngest matching youth category (14 před 18),
 * otherwise the oldest matching veteran category, else the open one.
 */
export function defaultCategory<T extends { age: number }>(categories: T[]): T | null {
  if (categories.length === 0) {
    return null;
  }
  const youth = categories.filter((category) => isYouth({ sex: "", age: category.age }));
  if (youth.length > 0) {
    return youth.reduce((best, category) => (category.age < best.age ? category : best));
  }
  return categories.reduce((best, category) => (category.age > best.age ? category : best));
}

export function pickCategoryByBirthYear<T extends CategoryRule>(
  birthYear: number,
  sex: string,
  raceYear: number,
  categories: T[],
): T | null {
  return defaultCategory(eligibleCategoriesFor(birthYear, sex, raceYear, categories));
}
