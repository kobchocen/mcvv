/**
 * Changing a runner's sex (pure helpers, no DB access).
 *
 * The runner id (cis_bezec.id, char(8)) encodes birth year and sex: `YYYY` + sex digit +
 * 3-digit sequence. New runners get `YYYY0nnn` (men) or `YYYY5nnn` (women) with the next free
 * sequence of that prefix (see resolveRunner). Legacy ids may use other digits of the same
 * range (men 0–4, women 5–9), which is why `runnerSex` compares the digit with "5".
 * A sex change therefore means a NEW id; all references are re-pointed (runner-rekey.ts).
 */
import { pickCategoryByBirthYear } from "@/lib/entries/category";

export type Sex = "M" | "F";

export function runnerSexOf(id: string): Sex {
  return id.charAt(4) < "5" ? "M" : "F";
}

export function birthYearOf(id: string): number {
  return Number(id.slice(0, 4));
}

export function oppositeSex(sex: Sex): Sex {
  return sex === "M" ? "F" : "M";
}

/** Preferred digit first (0 / 5, as resolveRunner), then the rest of the sex range. */
export function sexDigits(sex: Sex): string[] {
  return sex === "M" ? ["0", "1", "2", "3", "4"] : ["5", "6", "7", "8", "9"];
}

export function isRunnerId(id: string): boolean {
  return /^\d{8}$/.test(id);
}

/**
 * Next free runner id for a birth year and sex, following the allocation of new runners:
 * prefix `YYYY` + sex digit, sequence = highest existing sequence of that prefix + 1.
 * `taken` must contain every id of the birth year (cis_bezec) plus any id that is still
 * referenced elsewhere (orphan rows); such ids are skipped. When a prefix is full (999),
 * the next digit of the same sex range is used.
 */
export function allocateRunnerId(taken: Iterable<string>, birthYear: number, sex: Sex): string {
  if (!Number.isInteger(birthYear) || birthYear < 1000 || birthYear > 9999) {
    throw new Error(`Invalid birth year: ${birthYear}`);
  }
  const used = new Set(taken);
  for (const digit of sexDigits(sex)) {
    const prefix = `${birthYear}${digit}`;
    const seqs = [...used]
      .filter((id) => id.startsWith(prefix) && id.length === 8)
      .map((id) => Number.parseInt(id.slice(5), 10))
      .filter((value) => Number.isFinite(value));
    let next = (seqs.length ? Math.max(...seqs) : 0) + 1;
    while (next <= 999 && used.has(`${prefix}${String(next).padStart(3, "0")}`)) {
      next += 1;
    }
    if (next <= 999) {
      return `${prefix}${String(next).padStart(3, "0")}`;
    }
  }
  throw new Error(`No free runner id for ${birthYear}/${sex}`);
}

export type CategoryRow = { id: string; name: string; sex: string; age: number; entryFee: number };

export type LineInput = {
  year: number;
  registrationId: number;
  categoryId: string;
  entryFee: number | null;
};

export type LinePlan = {
  year: number;
  registrationId: number;
  oldCategory: { id: string; name: string };
  newCategory: { id: string; name: string } | null;
  oldFee: number;
  newFee: number;
  /** Fee is only recalculated for the current race year (past years are settled). */
  feeChanged: boolean;
};

export type CategoryChange = {
  year: number;
  oldCategory: { id: string; name: string };
  newCategory: { id: string; name: string } | null;
};

/**
 * New category and fee of a registration line after the sex change.
 * A line that was free (fee 0 while its category costs something – organizer, former winner,
 * veteran) stays free; otherwise the fee follows the new category.
 */
export function planLine(
  line: LineInput,
  newSex: Sex,
  birthYear: number,
  categories: CategoryRow[],
  currentYear: number,
): LinePlan {
  const old = categories.find((category) => category.id === line.categoryId);
  const target = pickCategoryByBirthYear(birthYear, newSex, line.year, categories);
  const oldFee = line.entryFee ?? old?.entryFee ?? 0;
  const wasFree = oldFee === 0 && (old?.entryFee ?? 0) > 0;
  const recalc = line.year === currentYear && target !== null;
  const newFee = recalc ? (wasFree ? 0 : target.entryFee) : oldFee;
  return {
    year: line.year,
    registrationId: line.registrationId,
    oldCategory: { id: line.categoryId, name: old?.name ?? line.categoryId },
    newCategory: target ? { id: target.id, name: target.name } : null,
    oldFee,
    newFee,
    feeChanged: newFee !== oldFee,
  };
}

export function planCategory(
  row: { year: number; categoryId: string },
  newSex: Sex,
  birthYear: number,
  categories: CategoryRow[],
): CategoryChange {
  const old = categories.find((category) => category.id === row.categoryId);
  const target = pickCategoryByBirthYear(birthYear, newSex, row.year, categories);
  return {
    year: row.year,
    oldCategory: { id: row.categoryId, name: old?.name ?? row.categoryId },
    newCategory: target ? { id: target.id, name: target.name } : null,
  };
}

export type SexChangePlan = {
  oldId: string;
  newId: string;
  name: string;
  oldSex: Sex;
  newSex: Sex;
  lines: LinePlan[];
  starts: CategoryChange[];
  results: CategoryChange[];
  photos: number;
  webImages: number;
};

export function buildSexChangePlan(input: {
  runner: { id: string; name: string };
  takenIds: Iterable<string>;
  lines: LineInput[];
  starts: { year: number; categoryId: string }[];
  results: { year: number; categoryId: string }[];
  photos: number;
  webImages: number;
  categories: CategoryRow[];
  currentYear: number;
}): SexChangePlan {
  const { runner, categories, currentYear } = input;
  if (!isRunnerId(runner.id)) {
    throw new Error(`Unexpected runner id format: ${runner.id}`);
  }
  const oldSex = runnerSexOf(runner.id);
  const newSex = oppositeSex(oldSex);
  const birthYear = birthYearOf(runner.id);
  const newId = allocateRunnerId(input.takenIds, birthYear, newSex);
  return {
    oldId: runner.id,
    newId,
    name: runner.name,
    oldSex,
    newSex,
    lines: input.lines
      .map((line) => planLine(line, newSex, birthYear, categories, currentYear))
      .sort((a, b) => b.year - a.year),
    starts: input.starts
      .map((row) => planCategory(row, newSex, birthYear, categories))
      .sort((a, b) => b.year - a.year),
    results: input.results
      .map((row) => planCategory(row, newSex, birthYear, categories))
      .sort((a, b) => b.year - a.year),
    photos: input.photos,
    webImages: input.webImages,
  };
}
