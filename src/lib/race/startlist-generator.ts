import type { BibRange } from "./start-settings";
import { startSeriesForBib, startSlot, type StartModel } from "./start-time";

/**
 * Návrh startovky (#115) – deterministický, žádné losování. Pravidla (Pavel, 20. 10. 2026):
 *
 * a) pořadatelé z přihlášky č. 1 ročníku dostanou čísla od 1 (1. start) a od 601 (2. start)
 *    postupně, podle pořadí kategorií a jména;
 * b) v okně kategorie (rozsah čísel ročníku) se běžci rozprostřou rovnoměrně, bez velkých děr;
 * c) nejdřív nováčci a běžci bez loňského času (podle jména), pak vracející se podle loňského
 *    času od nejpomalejšího – nejrychlejší startují na konci, závod graduje;
 * d) skupiny „společný start“ (stejný čas, typicky každý v jiném startu) a „navazující start“
 *    (časy hned po sobě) drží generátor u sebe výměnou čísel uvnitř okna kategorie;
 * e) zamčená (ručně změněná) čísla zůstanou beze změny a nikdo jiný je nedostane;
 * f) generátor nic nezveřejňuje – vrací jen návrh, ukládá se samostatně.
 *
 * Obhájci (absolutní vítězové minulého ročníku) dostanou číslo obhájce z nastavení ročníku.
 * Čísla mimo okna kategorií (rezerva) generátor nepřiděluje.
 */

export type StartGroupKind = "joint" | "consecutive";

export type GeneratorEntry = {
  runnerId: string;
  name: string;
  categoryId: string;
  /** Číslo uložené v DB (jen pro rozdíl a pro zamčené řádky). */
  currentBib: number | null;
  locked: boolean;
  /** Platná (zaplacená / potvrzená, nezrušená) přihláška – jen ty dostanou číslo. */
  eligible: boolean;
  /** Řádek přihlášky č. 1 (pořadatelé). */
  organizer: boolean;
  /** Loňský čas v sekundách, null = nováček nebo loni neběžel. */
  lastYearTime: number | null;
  groupId: number | null;
  groupOrder: number;
};

export type GeneratorInput = {
  model: StartModel;
  ranges: BibRange[];
  /** Pořadí kategorií (cis_mcvv_kateg.sort) pro řazení pořadatelů. */
  categorySort: Record<string, number>;
  champions: { runnerId: string; bib: number }[];
  groups: { id: number; kind: StartGroupKind }[];
  entries: GeneratorEntry[];
  locale?: string;
};

export type AssignmentReason =
  "locked" | "champion" | "organizer" | "category" | "group" | "ineligible" | "unassigned";

export type ProposedLine = {
  runnerId: string;
  bib: number | null;
  previousBib: number | null;
  reason: AssignmentReason;
};

export type GeneratorWarning =
  | { code: "shortage"; categoryId: string; runners: number; slots: number }
  | { code: "noRange"; categoryId: string; runners: number }
  | { code: "lockedDuplicate"; bib: number; runnerIds: string[] }
  | { code: "championTaken"; runnerId: string; bib: number }
  | { code: "organizerBlockFull"; series: 1 | 2; runnerIds: string[] }
  | { code: "groupApprox"; groupId: number; deviation: number }
  | { code: "groupLockedConflict"; groupId: number };

export type CategorySummary = {
  categoryId: string;
  bibFrom: number;
  bibTo: number;
  runners: number;
  slots: number;
  assigned: number;
};

export type StartListProposal = {
  lines: ProposedLine[];
  categories: CategorySummary[];
  warnings: GeneratorWarning[];
  /** Návrh nejde uložit (nedostatek čísel, kategorie bez rozsahu). */
  blocking: boolean;
  changed: number;
};

/** Rovnoměrné rozprostření n běžců do m volných čísel (indexy rostou, rozdíly se liší max. o 1). */
export function spreadIndexes(n: number, m: number): number[] {
  if (n <= 0 || m <= 0) {
    return [];
  }
  const count = Math.min(n, m);
  return Array.from({ length: count }, (_, i) => Math.floor((i * m) / count));
}

/** Pořadí v okně kategorie: nováčci / bez loňského času (jméno), pak loňský čas sestupně. */
export function seedOrder<
  T extends { name: string; lastYearTime: number | null; runnerId: string },
>(runners: T[], locale = "cs"): T[] {
  const byName = (a: T, b: T) =>
    a.name.localeCompare(b.name, locale) || a.runnerId.localeCompare(b.runnerId);
  const fresh = runners.filter((r) => r.lastYearTime == null).sort(byName);
  const returning = runners
    .filter((r) => r.lastYearTime != null)
    .sort((a, b) => (b.lastYearTime ?? 0) - (a.lastYearTime ?? 0) || byName(a, b));
  return [...fresh, ...returning];
}

function rangeSeries(model: StartModel, range: BibRange | undefined): 1 | 2 {
  return range ? startSeriesForBib(model, range.bibFrom) : 1;
}

export function generateStartList(input: GeneratorInput): StartListProposal {
  const { model, entries } = input;
  const locale = input.locale ?? "cs";
  const warnings: GeneratorWarning[] = [];
  const rangeByCategory = new Map(input.ranges.map((range) => [range.categoryId, range]));
  const bib = new Map<string, number | null>();
  const reason = new Map<string, AssignmentReason>();
  const occupied = new Map<number, string>();
  const byName = (a: GeneratorEntry, b: GeneratorEntry) =>
    a.name.localeCompare(b.name, locale) || a.runnerId.localeCompare(b.runnerId);

  const assign = (entry: GeneratorEntry, value: number, why: AssignmentReason) => {
    bib.set(entry.runnerId, value);
    reason.set(entry.runnerId, why);
    occupied.set(value, entry.runnerId);
  };

  // e) Zamčená čísla zůstávají (i u neplatných přihlášek).
  const lockedByBib = new Map<number, string[]>();
  for (const entry of entries) {
    if (entry.locked && entry.currentBib != null && entry.currentBib > 0) {
      assign(entry, entry.currentBib, "locked");
      lockedByBib.set(entry.currentBib, [
        ...(lockedByBib.get(entry.currentBib) ?? []),
        entry.runnerId,
      ]);
    } else if (entry.locked) {
      bib.set(entry.runnerId, null);
      reason.set(entry.runnerId, "locked");
    }
  }
  for (const [value, ids] of lockedByBib) {
    if (ids.length > 1) {
      warnings.push({ code: "lockedDuplicate", bib: value, runnerIds: ids });
    }
  }
  const pending = (entry: GeneratorEntry) => !reason.has(entry.runnerId);

  // Neplatné přihlášky číslo nedostanou (nezamčené číslo se odebere).
  for (const entry of entries) {
    if (pending(entry) && !entry.eligible) {
      bib.set(entry.runnerId, null);
      reason.set(entry.runnerId, "ineligible");
    }
  }

  // Obhájci.
  const entryById = new Map(entries.map((entry) => [entry.runnerId, entry]));
  for (const champion of input.champions) {
    const entry = entryById.get(champion.runnerId);
    if (!entry || !pending(entry)) {
      continue;
    }
    if (occupied.has(champion.bib)) {
      warnings.push({ code: "championTaken", runnerId: entry.runnerId, bib: champion.bib });
      continue;
    }
    assign(entry, champion.bib, "champion");
  }

  // a) Pořadatelé od 1 / 601 až po začátek prvního rozsahu kategorie ve startu.
  for (const series of [1, 2] as const) {
    const first = series === 1 ? 1 : model.secondStartFrom;
    const seriesRanges = input.ranges.filter((range) => rangeSeries(model, range) === series);
    const blockEnd =
      seriesRanges.length > 0
        ? Math.min(...seriesRanges.map((range) => range.bibFrom)) - 1
        : series === 1
          ? model.secondStartFrom - 1
          : first + 999;
    const organizers = entries
      .filter(
        (entry) =>
          pending(entry) &&
          entry.organizer &&
          rangeSeries(model, rangeByCategory.get(entry.categoryId)) === series,
      )
      .sort(
        (a, b) =>
          (input.categorySort[a.categoryId] ?? 99) - (input.categorySort[b.categoryId] ?? 99) ||
          byName(a, b),
      );
    let next = first;
    const overflow: string[] = [];
    for (const entry of organizers) {
      while (next <= blockEnd && occupied.has(next)) {
        next += 1;
      }
      if (next > blockEnd) {
        overflow.push(entry.runnerId);
        continue;
      }
      assign(entry, next, "organizer");
      next += 1;
    }
    if (overflow.length > 0) {
      warnings.push({ code: "organizerBlockFull", series, runnerIds: overflow });
    }
  }

  // b) + c) Okna kategorií.
  const categories: CategorySummary[] = [];
  const freeByCategory = new Map<string, Set<number>>();
  const categoryIds = [...new Set(entries.map((entry) => entry.categoryId))];
  for (const categoryId of categoryIds) {
    if (!rangeByCategory.has(categoryId)) {
      const orphans = entries.filter((entry) => pending(entry) && entry.categoryId === categoryId);
      if (orphans.length > 0) {
        warnings.push({ code: "noRange", categoryId, runners: orphans.length });
        for (const entry of orphans) {
          bib.set(entry.runnerId, null);
          reason.set(entry.runnerId, "unassigned");
        }
      }
    }
  }
  for (const range of input.ranges) {
    const runners = seedOrder(
      entries.filter((entry) => pending(entry) && entry.categoryId === range.categoryId),
      locale,
    );
    const free: number[] = [];
    for (let value = range.bibFrom; value <= range.bibTo; value += 1) {
      if (!occupied.has(value)) {
        free.push(value);
      }
    }
    const indexes = spreadIndexes(runners.length, free.length);
    indexes.forEach((index, i) => assign(runners[i], free[index], "category"));
    for (const entry of runners.slice(indexes.length)) {
      bib.set(entry.runnerId, null);
      reason.set(entry.runnerId, "unassigned");
    }
    if (runners.length > free.length) {
      warnings.push({
        code: "shortage",
        categoryId: range.categoryId,
        runners: runners.length,
        slots: free.length,
      });
    }
    const left = new Set(free);
    for (const index of indexes) {
      left.delete(free[index]);
    }
    freeByCategory.set(range.categoryId, left);
    if (runners.length > 0 || free.length < range.bibTo - range.bibFrom + 1) {
      categories.push({
        categoryId: range.categoryId,
        bibFrom: range.bibFrom,
        bibTo: range.bibTo,
        runners: runners.length,
        slots: free.length,
        assigned: indexes.length,
      });
    }
  }

  // d) Skupiny: výměnou čísel v okně kategorie co nejblíž požadovanému času.
  const pinned = new Set<string>();
  for (const group of [...input.groups].sort((a, b) => a.id - b.id)) {
    const members = entries
      .filter((entry) => entry.groupId === group.id && bib.get(entry.runnerId) != null)
      .sort((a, b) => a.groupOrder - b.groupOrder || byName(a, b));
    if (members.length < 2) {
      continue;
    }
    const offset = (k: number) => (group.kind === "consecutive" ? k : 0);
    const movable = (entry: GeneratorEntry) =>
      reason.get(entry.runnerId) === "category" && !pinned.has(entry.runnerId);
    const candidates = (entry: GeneratorEntry, taken: Set<number>): number[] => {
      const range = rangeByCategory.get(entry.categoryId);
      if (!range) {
        return [];
      }
      const out: number[] = [];
      for (let value = range.bibFrom; value <= range.bibTo; value += 1) {
        if (taken.has(value)) {
          continue;
        }
        const holder = occupied.get(value);
        if (holder === undefined) {
          if (freeByCategory.get(entry.categoryId)?.has(value)) {
            out.push(value);
          }
          continue;
        }
        const holderEntry = entryById.get(holder);
        if (
          holder === entry.runnerId ||
          (holderEntry && movable(holderEntry) && !members.includes(holderEntry))
        ) {
          out.push(value);
        }
      }
      return out;
    };
    const fixed = members.map((entry, k) => ({ entry, k })).filter(({ entry }) => !movable(entry));
    const anchors = new Set<number>();
    if (fixed.length > 0) {
      for (const { entry, k } of fixed) {
        anchors.add(startSlot(model, bib.get(entry.runnerId)!) - offset(k));
      }
      if (anchors.size > 1) {
        warnings.push({ code: "groupLockedConflict", groupId: group.id });
      }
    } else {
      members.forEach((entry, k) => {
        for (const value of candidates(entry, new Set())) {
          anchors.add(startSlot(model, value) - offset(k));
        }
      });
    }
    type Plan = { cost: number; disruption: number; anchor: number; picks: Map<string, number> };
    const plan = (anchor: number): Plan => {
      const taken = new Set<number>();
      const picks = new Map<string, number>();
      let cost = 0;
      let disruption = 0;
      members.forEach((entry, k) => {
        const current = bib.get(entry.runnerId)!;
        const desired = anchor + offset(k);
        if (!movable(entry)) {
          cost += Math.abs(startSlot(model, current) - desired);
          taken.add(current);
          return;
        }
        let best: number | null = null;
        let bestScore = Number.POSITIVE_INFINITY;
        for (const value of candidates(entry, taken)) {
          const score =
            Math.abs(startSlot(model, value) - desired) * 10000 + Math.abs(value - current);
          if (score < bestScore) {
            best = value;
            bestScore = score;
          }
        }
        if (best == null) {
          cost += 1000;
          return;
        }
        taken.add(best);
        picks.set(entry.runnerId, best);
        cost += Math.abs(startSlot(model, best) - desired);
        disruption += Math.abs(best - current);
      });
      return { cost, disruption, anchor, picks };
    };
    let chosen: Plan | null = null;
    for (const anchor of [...anchors].sort((a, b) => a - b)) {
      const candidate = plan(anchor);
      if (
        !chosen ||
        candidate.cost < chosen.cost ||
        (candidate.cost === chosen.cost && candidate.disruption < chosen.disruption)
      ) {
        chosen = candidate;
      }
    }
    if (!chosen) {
      continue;
    }
    for (const entry of members) {
      const target = chosen.picks.get(entry.runnerId);
      const current = bib.get(entry.runnerId)!;
      if (target === undefined || target === current) {
        pinned.add(entry.runnerId);
        continue;
      }
      const holder = occupied.get(target);
      const free = freeByCategory.get(entry.categoryId)!;
      if (holder !== undefined) {
        const other = entryById.get(holder)!;
        assign(other, current, "category");
      } else {
        occupied.delete(current);
        free.delete(target);
        free.add(current);
      }
      assign(entry, target, "group");
      pinned.add(entry.runnerId);
    }
    for (const entry of members) {
      if (reason.get(entry.runnerId) === "category") {
        reason.set(entry.runnerId, "group");
      }
    }
    if (chosen.cost > 0) {
      warnings.push({ code: "groupApprox", groupId: group.id, deviation: chosen.cost });
    }
  }

  const lines: ProposedLine[] = entries.map((entry) => ({
    runnerId: entry.runnerId,
    bib: bib.get(entry.runnerId) ?? null,
    previousBib: entry.currentBib,
    reason: reason.get(entry.runnerId) ?? "unassigned",
  }));
  const blocking = warnings.some(
    (warning) => warning.code === "shortage" || warning.code === "noRange",
  );
  const changed = lines.filter((line) => line.bib !== line.previousBib).length;
  return { lines, categories, warnings, blocking, changed };
}
