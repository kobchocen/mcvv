import { allocateRunnerId } from "@/lib/admin/runner-sex-core";
import { prisma } from "@/lib/db/client";
import {
  defaultCategory,
  eligibleCategoriesFor,
  pickCategoryByBirthYear,
} from "@/lib/entries/category";
import { runnerBirthYear, runnerSex } from "@/lib/stats/queries";

export function sexDigit(sex: "M" | "F"): string {
  return sex === "M" ? "0" : "5";
}

export function runnerPrefix(birthYear: number, sex: "M" | "F"): string {
  return `${birthYear}${sexDigit(sex)}`;
}

export type ResolveRunnerResult = { id: string } | { error: "ambiguous" };

function normalizeRunnerName(firstName: string, lastName: string): string {
  return `${lastName.trim()} ${firstName.trim()}`.replace(/\s+/g, " ").slice(0, 50);
}

export async function resolveRunner(input: {
  firstName: string;
  lastName: string;
  birthYear: number;
  sex: "M" | "F";
}): Promise<ResolveRunnerResult> {
  const name = normalizeRunnerName(input.firstName, input.lastName);
  const yearPrefix = String(input.birthYear);
  const sex = sexDigit(input.sex);
  const yearMates = await prisma.runner.findMany({
    where: { id: { startsWith: yearPrefix } },
    select: { id: true, name: true },
  });
  const wanted = name.toLowerCase();
  const matches = yearMates.filter((row) => row.name.trim().toLowerCase() === wanted);
  if (matches.length === 1) {
    return { id: matches[0].id };
  }
  if (matches.length > 1) {
    const sexMatches = matches.filter((row) => row.id.charAt(4) === sex);
    if (sexMatches.length === 1) {
      return { id: sexMatches[0].id };
    }
    return { error: "ambiguous" };
  }
  // Same allocation as the admin sex change: YYYY + 0/5 + next sequence of that prefix.
  const id = allocateRunnerId(
    yearMates.map((row) => row.id),
    input.birthYear,
    input.sex,
  );
  await prisma.runner.create({
    data: { id, name, author: "web" },
  });
  return { id };
}

export function eligibleCategories<T extends { sex: string; age: number }>(
  birthYear: number,
  sex: "M" | "F",
  raceYear: number,
  categories: T[],
): T[] {
  return eligibleCategoriesFor(birthYear, sex, raceYear, categories);
}

export function pickCategory<T extends { sex: string; age: number }>(
  runnerId: string,
  raceYear: number,
  categories: T[],
): T | null {
  return pickCategoryByBirthYear(
    runnerBirthYear(runnerId),
    runnerSex(runnerId),
    raceYear,
    categories,
  );
}

export { defaultCategory };
