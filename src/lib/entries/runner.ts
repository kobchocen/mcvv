import { prisma } from "@/lib/db/client";
import { isEligible } from "@/lib/stats/queries";

export function sexDigit(sex: "M" | "F"): string {
  return sex === "M" ? "0" : "5";
}

export function runnerPrefix(birthYear: number, sex: "M" | "F"): string {
  return `${birthYear}${sexDigit(sex)}`;
}

export async function resolveRunner(input: {
  firstName: string;
  lastName: string;
  birthYear: number;
  sex: "M" | "F";
}): Promise<string> {
  const name = `${input.lastName.trim()} ${input.firstName.trim()}`
    .replace(/\s+/g, " ")
    .slice(0, 50);
  const prefix = runnerPrefix(input.birthYear, input.sex);
  const existing = await prisma.runner.findFirst({
    where: { name, id: { startsWith: prefix } },
    select: { id: true },
  });
  if (existing) {
    return existing.id;
  }
  const siblings = await prisma.runner.findMany({
    where: { id: { startsWith: prefix } },
    select: { id: true },
  });
  const seqs = siblings
    .map((row) => Number.parseInt(row.id.slice(5), 10))
    .filter((value) => Number.isFinite(value));
  const next = (seqs.length ? Math.max(...seqs) : 0) + 1;
  const id = `${prefix}${String(next).padStart(3, "0")}`;
  await prisma.runner.create({
    data: { id, name, author: "web" },
  });
  return id;
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
  if (eligible.length === 0) {
    return null;
  }
  const juniors = eligible.filter((category) => category.age > 0 && category.age <= 20);
  if (juniors.length > 0) {
    return juniors.sort((a, b) => b.age - a.age)[0];
  }
  const veterans = eligible.filter((category) => category.age > 20);
  if (veterans.length > 0) {
    return veterans.sort((a, b) => b.age - a.age)[0];
  }
  return eligible[0] ?? null;
}
