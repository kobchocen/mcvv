/**
 * Plán importu z OBD po prezentaci (#119). Čisté funkce: ze souborů
 * a snímku DB spočítají, co se zapíše, a rozdíly pro náhled. Zápis dělá
 * `obd-import-data.ts` v jedné transakci podle tohoto plánu.
 */
import { createHash } from "node:crypto";

import type { DictRow, ObdRowError, RaceRow } from "./obd-csv";

/** Klíč klubu jako v DB (kolace utf8mb4_unicode_ci: bez ohledu na velikost a diakritiku). */
export function clubKey(id: string): string {
  return id
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toUpperCase()
    .trimEnd();
}

export type NamedId = { id: string; name: string };

export type DictSnapshot = {
  year: number;
  /** cis_bezec: id → jméno */
  runners: ReadonlyMap<string, string>;
  /** cis_klub pro aktuální rok: clubKey → {id, name} */
  clubsThisYear: ReadonlyMap<string, NamedId>;
  /** cis_klub z jiných let (nejnovější název): clubKey → {id, name} */
  clubsOtherYears: ReadonlyMap<string, NamedId>;
};

export type StartWrite = {
  runnerId: string;
  clubId: string;
  categoryId: string;
  year: number;
  bib: number;
  runnerName: string;
  clubName: string;
};

export type PresentationSnapshot = DictSnapshot & {
  /** mcvv_prihlaska_radek pro rok: runnerId → číslo (null = bez čísla) */
  registrationBibs: ReadonlyMap<string, number | null>;
  /** mcvv_start pro rok */
  currentStart: readonly (Omit<StartWrite, "runnerName" | "clubName" | "year"> & {
    runnerName: string | null;
    clubName: string | null;
  })[];
};

export type PresentationFiles = {
  runners?: DictRow[];
  clubs?: DictRow[];
  starts?: RaceRow[];
};

export type NameDiff = { id: string; current: string; file: string };

export type PresentationPlan = {
  year: number;
  newRunners: NamedId[];
  runnerNameDiffs: NameDiff[];
  newClubs: NamedId[];
  clubNameDiffs: NameDiff[];
  /** Klub ze startovky existuje jen v jiném roce → založí se pro aktuální rok (upozornění). */
  copiedClubs: NamedId[];
  start: null | {
    rows: StartWrite[];
    replaced: number;
    unchanged: boolean;
    bibChanges: { runnerId: string; from: number; to: number }[];
    /** Ve startovce, ale bez přihlášky (přihlášky na místě). */
    walkIns: string[];
    /** Přihláška s číslem, která ve startovce chybí. */
    missing: { runnerId: string; bib: number }[];
  };
  errors: ObdRowError[];
  hash: string;
};

function hashOf(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 32);
}

type ClubResolution = {
  resolve: (clubId: string) => NamedId | null;
  copied: NamedId[];
};

/** Kluby pro rok: z DB, z nahraného cis_klub.csv, jinak zkopírovat z jiného roku. */
function clubResolver(snapshot: DictSnapshot, newClubs: readonly NamedId[]): ClubResolution {
  const fromFile = new Map(newClubs.map((club) => [clubKey(club.id), club]));
  const copied = new Map<string, NamedId>();
  return {
    resolve(clubId) {
      const key = clubKey(clubId);
      const found = snapshot.clubsThisYear.get(key) ?? fromFile.get(key) ?? copied.get(key);
      if (found) return found;
      const other = snapshot.clubsOtherYears.get(key);
      if (!other) return null;
      copied.set(key, other);
      return other;
    },
    get copied() {
      return [...copied.values()];
    },
  };
}

function planDictionaries(snapshot: DictSnapshot, files: PresentationFiles) {
  const newRunners: NamedId[] = [];
  const runnerNameDiffs: NameDiff[] = [];
  for (const row of files.runners ?? []) {
    const current = snapshot.runners.get(row.id);
    if (current === undefined) newRunners.push({ id: row.id, name: row.name });
    else if (current.trim() !== row.name) {
      runnerNameDiffs.push({ id: row.id, current, file: row.name });
    }
  }
  const newClubs: NamedId[] = [];
  const clubNameDiffs: NameDiff[] = [];
  for (const row of files.clubs ?? []) {
    const current = snapshot.clubsThisYear.get(clubKey(row.id));
    if (!current) newClubs.push({ id: row.id, name: row.name });
    else if (current.name.trim() !== row.name) {
      clubNameDiffs.push({ id: row.id, current: current.name, file: row.name });
    }
  }
  return { newRunners, runnerNameDiffs, newClubs, clubNameDiffs };
}

/**
 * Import po prezentaci (legacy admin/import.php):
 * - cis_bezec.csv: vloží jen neexistující id (jména existujících se nemění, jen hlásí),
 * - cis_klub.csv: vloží jen neexistující (id, aktuální rok),
 * - start.csv: přepíše celý mcvv_start pro rok; jména doplní z číselníků.
 */
export function planPresentationImport(
  snapshot: PresentationSnapshot,
  files: PresentationFiles,
): PresentationPlan {
  const dict = planDictionaries(snapshot, files);
  const errors: ObdRowError[] = [];
  const newRunnerNames = new Map(dict.newRunners.map((row) => [row.id, row.name]));
  const clubs = clubResolver(snapshot, dict.newClubs);
  let start: PresentationPlan["start"] = null;

  if (files.starts) {
    const rows: StartWrite[] = [];
    for (const row of files.starts) {
      const runnerName = snapshot.runners.get(row.runnerId) ?? newRunnerNames.get(row.runnerId);
      if (runnerName === undefined) {
        errors.push({ file: "start", line: row.line, code: "unknown_runner", value: row.runnerId });
        continue;
      }
      const club = clubs.resolve(row.clubId);
      if (!club) {
        errors.push({ file: "start", line: row.line, code: "unknown_club", value: row.clubId });
        continue;
      }
      rows.push({
        runnerId: row.runnerId,
        clubId: club.id,
        categoryId: row.categoryId,
        year: snapshot.year,
        bib: row.value,
        runnerName: runnerName.slice(0, 50),
        clubName: club.name.slice(0, 50),
      });
    }
    // Včetně jmen: opakovaný import doplní/opraví i bezec_name a klub_name.
    const key = (row: {
      runnerId: string;
      clubId: string;
      categoryId: string;
      bib: number;
      runnerName: string | null;
      clubName: string | null;
    }) =>
      `${row.runnerId};${row.clubId};${row.categoryId};${row.bib};${row.runnerName ?? ""};${row.clubName ?? ""}`;
    const current = [...snapshot.currentStart].map(key).sort();
    const next = rows.map(key).sort();
    const bibChanges: { runnerId: string; from: number; to: number }[] = [];
    const walkIns: string[] = [];
    const inStart = new Set(rows.map((row) => row.runnerId));
    for (const row of rows) {
      if (!snapshot.registrationBibs.has(row.runnerId)) walkIns.push(row.runnerId);
      else {
        const from = snapshot.registrationBibs.get(row.runnerId);
        if (from != null && from !== row.bib) {
          bibChanges.push({ runnerId: row.runnerId, from, to: row.bib });
        }
      }
    }
    const missing = [...snapshot.registrationBibs]
      .filter(([runnerId, bib]) => bib != null && bib > 0 && !inStart.has(runnerId))
      .map(([runnerId, bib]) => ({ runnerId, bib: bib! }))
      .sort((a, b) => a.bib - b.bib);
    start = {
      rows: rows.sort((a, b) => a.bib - b.bib),
      replaced: snapshot.currentStart.length,
      unchanged: current.length === next.length && current.every((value, i) => value === next[i]),
      bibChanges,
      walkIns,
      missing,
    };
  }

  const plan = {
    year: snapshot.year,
    ...dict,
    copiedClubs: clubs.copied,
    start,
    errors,
  };
  return {
    ...plan,
    hash: hashOf({
      year: plan.year,
      newRunners: plan.newRunners,
      newClubs: plan.newClubs,
      copiedClubs: plan.copiedClubs,
      start: start?.rows ?? null,
      current: [...snapshot.currentStart].map((row) => [row.runnerId, row.bib]).sort(),
    }),
  };
}

/** Má plán něco zapsat? (Opakovaný import stejných souborů = nic.) */
export function presentationHasChanges(plan: PresentationPlan): boolean {
  return (
    plan.newRunners.length > 0 ||
    plan.newClubs.length > 0 ||
    plan.copiedClubs.length > 0 ||
    (plan.start !== null && !plan.start.unchanged)
  );
}
