import { allocateRunnerId } from "@/lib/admin/runner-sex-core";
import { prisma } from "@/lib/db/client";
import { matchRunnerByPreviousName } from "@/lib/entries/runner-match";
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

export type ResolveRunnerResult =
  { id: string; name: string; created: boolean } | { error: "ambiguous" };

function normalizeRunnerName(firstName: string, lastName: string): string {
  return `${lastName.trim()} ${firstName.trim()}`.replace(/\s+/g, " ").slice(0, 50);
}

export async function resolveRunner(input: {
  firstName: string;
  lastName: string;
  birthYear: number;
  sex: "M" | "F";
  /** ISO kód státu (#200); null = neuvedeno. */
  nationality?: string | null;
}): Promise<ResolveRunnerResult> {
  const name = normalizeRunnerName(input.firstName, input.lastName);
  const yearPrefix = String(input.birthYear);
  const sex = sexDigit(input.sex);
  const yearMates = await prisma.runner.findMany({
    where: { id: { startsWith: yearPrefix } },
    select: { id: true, name: true, nationality: true },
  });
  const nationality = input.nationality ?? null;
  // Existující běžec: příslušnost jen doplníme, pokud chybí – přihlašující nepřepíše
  // údaj, který už je v číselníku (opravu dělá pořadatel v administraci).
  const fillNationality = async (runner: { id: string; nationality: string | null }) => {
    if (nationality && !runner.nationality) {
      await prisma.runner.update({ where: { id: runner.id }, data: { nationality } });
    }
  };
  const wanted = name.toLowerCase();
  const matches = yearMates.filter((row) => row.name.trim().toLowerCase() === wanted);
  if (matches.length === 1) {
    await fillNationality(matches[0]);
    return { id: matches[0].id, name: matches[0].name, created: false };
  }
  if (matches.length > 1) {
    const sexMatches = matches.filter((row) => row.id.charAt(4) === sex);
    if (sexMatches.length === 1) {
      await fillNationality(sexMatches[0]);
      return { id: sexMatches[0].id, name: sexMatches[0].name, created: false };
    }
    return { error: "ambiguous" };
  }
  // Dřívější jméno (#198, Q252): po přejmenování (svatba / oprava) drží staré jméno jen
  // ročníky ve výsledcích a startovkách. Jednoznačná shoda jméno + rok + pohlaví = týž běžec.
  const previous = await findRunnerByPreviousName(name, input.birthYear, sex, yearMates);
  if (previous) {
    await fillNationality(previous);
    return { id: previous.id, name: previous.name, created: false };
  }
  // Same allocation as the admin sex change: YYYY + 0/5 + next sequence of that prefix.
  const id = allocateRunnerId(
    yearMates.map((row) => row.id),
    input.birthYear,
    input.sex,
  );
  await prisma.runner.create({
    data: { id, name, author: "web", nationality },
  });
  return { id, name, created: true };
}

async function findRunnerByPreviousName<T extends { id: string }>(
  name: string,
  birthYear: number,
  sex: string,
  yearMates: readonly T[],
): Promise<T | null> {
  const prefix = `${birthYear}${sex}`;
  const where = { runnerId: { startsWith: prefix }, runnerName: name };
  // Kolace sloupce je case/accent-insensitive; přesné porovnání dělá matchRunnerByPreviousName.
  const [results, starts] = await Promise.all([
    prisma.result.findMany({ where, select: { runnerId: true, runnerName: true } }),
    prisma.startEntry.findMany({ where, select: { runnerId: true, runnerName: true } }),
  ]);
  const id = matchRunnerByPreviousName({
    wanted: name,
    birthYear,
    sexDigit: sex,
    rows: [...results, ...starts].map((row) => ({ runnerId: row.runnerId, name: row.runnerName })),
    existingIds: new Set(yearMates.map((row) => row.id)),
  });
  return yearMates.find((row) => row.id === id) ?? null;
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
