/**
 * Číselník běžců v administraci (#198) – čisté pomocné funkce pro hledání a detail.
 */
import { normalizeRunnerName } from "@/lib/admin/runner-rename-core";

export const RUNNER_SEARCH_MIN = 2;
export const RUNNER_SEARCH_LIMIT = 50;

export type RunnerYearSource = {
  year: number;
  runnerName?: string | null;
  clubId?: string | null;
  registrationId?: number | null;
};

export type RunnerYearRow = {
  year: number;
  /** `mcvv_time.bezec_name`, undefined = ročník bez výsledku. */
  resultName?: string | null;
  /** `mcvv_start.bezec_name`, undefined = ročník bez startovky. */
  startName?: string | null;
  clubId: string | null;
  registrationId: number | null;
};

/** Ročníky běžce (výsledky, startovky, přihlášky) od nejnovějšího. */
export function buildRunnerYears(input: {
  results: readonly RunnerYearSource[];
  starts: readonly RunnerYearSource[];
  lines: readonly RunnerYearSource[];
}): RunnerYearRow[] {
  const byYear = new Map<number, RunnerYearRow>();
  const row = (year: number) => {
    let current = byYear.get(year);
    if (!current) {
      current = { year, clubId: null, registrationId: null };
      byYear.set(year, current);
    }
    return current;
  };
  for (const line of input.lines) {
    const current = row(line.year);
    current.registrationId = line.registrationId ?? null;
    current.clubId = line.clubId ?? current.clubId;
  }
  for (const start of input.starts) {
    const current = row(start.year);
    current.startName = start.runnerName ?? null;
    current.clubId = start.clubId ?? current.clubId;
  }
  for (const result of input.results) {
    const current = row(result.year);
    current.resultName = result.runnerName ?? null;
    current.clubId = result.clubId ?? current.clubId;
  }
  return [...byYear.values()].sort((a, b) => b.year - a.year);
}

/** Jiná jména z ročníků než aktuální (bez rozdílu velikosti písmen), v pořadí výskytu. */
export function previousRunnerNames(
  current: string,
  names: readonly (string | null | undefined)[],
) {
  const key = (value: string) => normalizeRunnerName(value).toLocaleLowerCase("cs");
  const seen = new Set([key(current)]);
  const out: string[] = [];
  for (const name of names) {
    const clean = normalizeRunnerName(name);
    if (!clean || seen.has(key(clean))) continue;
    seen.add(key(clean));
    out.push(clean);
  }
  return out;
}

/** Hledaný text pro LIKE (min. délka, bez zástupných znaků uživatele). */
export function runnerSearchPattern(query: string | null | undefined): string | null {
  const clean = normalizeRunnerName(query);
  if (clean.length < RUNNER_SEARCH_MIN) return null;
  return `%${clean.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

/** Počet návrhů našeptávače v číselníku běžců. */
export const RUNNER_SUGGEST_LIMIT = 10;

export type RunnerSearchTerms = {
  /** LIKE vzory jednotlivých slov (každé slovo musí sedět – pořadí příjmení / jméno nehraje roli). */
  words: string[];
  /** Ročník narození zadaný jako samostatné čtyřmístné číslo (např. „Novák 1980“). */
  birthYear: number | null;
};

const BIRTH_YEAR_TOKEN = /^(19|20)\d{2}$/;

/**
 * Rozloží hledaný text na slova a případný ročník narození. Null = nic k hledání
 * (kratší než minimum a bez ročníku). Zástupné znaky uživatele (% _ \) se escapují.
 */
export function runnerSearchTerms(query: string | null | undefined): RunnerSearchTerms | null {
  const clean = normalizeRunnerName(query);
  if (clean.length < RUNNER_SEARCH_MIN) return null;
  let birthYear: number | null = null;
  const words: string[] = [];
  for (const token of clean.split(" ")) {
    if (birthYear === null && BIRTH_YEAR_TOKEN.test(token)) {
      birthYear = Number(token);
      continue;
    }
    words.push(`%${token.replace(/[\\%_]/g, (char) => `\\${char}`)}%`);
  }
  return words.length || birthYear !== null ? { words, birthYear } : null;
}
