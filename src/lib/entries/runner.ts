import { prisma } from "@/lib/db/client";
import { isEligible } from "@/lib/stats/queries";

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
  const prefix = runnerPrefix(input.birthYear, input.sex);
  const siblings = yearMates.filter((row) => row.id.startsWith(prefix));
  const seqs = siblings
    .map((row) => Number.parseInt(row.id.slice(5), 10))
    .filter((value) => Number.isFinite(value));
  const next = (seqs.length ? Math.max(...seqs) : 0) + 1;
  const id = `${prefix}${String(next).padStart(3, "0")}`;
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
  const fakeId = `${runnerPrefix(birthYear, sex)}001`;
  return categories.filter((category) => isEligible(fakeId, raceYear, category));
}

export function pickCategory<T extends { sex: string; age: number }>(
  runnerId: string,
  raceYear: number,
  categories: T[],
): T | null {
  const eligible = categories.filter((category) => isEligible(runnerId, raceYear, category));
  return defaultCategory(eligible);
}

export function defaultCategory<T extends { age: number }>(categories: T[]): T | null {
  if (categories.length === 0) {
    return null;
  }
  return categories.reduce((best, category) => (category.age > best.age ? category : best));
}
