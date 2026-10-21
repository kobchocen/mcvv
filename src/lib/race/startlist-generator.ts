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
 * d) skupiny „společný start“ (stejný čas, typicky každý v jiném startu; víc než dva členové
 *    jdou po dvojicích na časy hned po sobě) a „navazující start“ (časy hned po sobě) drží
 *    generátor u sebe. Kategorie není dogma (21. 10. 2026): skupina se umístí k „hostiteli“
 *    (kategorie většiny členů, při shodě nejlépe nasazený člen) a ostatní členové smí dostat
 *    číslo i v okně jiné kategorie nebo v druhém startu. Výsledková kategorie se nemění;
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
  /** Číslo leží mimo okno vlastní kategorie (jen informace – skupina, ruční úprava). */
  outsideCategory: boolean;
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

  // d) Skupiny (rodiny, kamarádi). Kategorie není dogma (Pavel, 21. 10. 2026): všichni běží
  //    stejnou trať, takže člen skupiny smí dostat číslo v okně jiné kategorie, i v druhém
  //    startu. Výsledková kategorie se nemění, mění se jen startovní pozice.
  const rangeOfBib = (value: number): BibRange | undefined =>
    input.ranges.find((range) => value >= range.bibFrom && value <= range.bibTo);
  const inOwnWindow = (entry: GeneratorEntry, value: number): boolean => {
    const range = rangeByCategory.get(entry.categoryId);
    return !!range && value >= range.bibFrom && value <= range.bibTo;
  };
  const ownSeries = (entry: GeneratorEntry) =>
    rangeSeries(model, rangeByCategory.get(entry.categoryId));
  /** Lépe nasazený = rychlejší loňský čas; bez loňského času je až za všemi s časem. */
  const compareSeed = (a: GeneratorEntry, b: GeneratorEntry): number => {
    if (a.lastYearTime == null || b.lastYearTime == null) {
      return (a.lastYearTime == null ? 1 : 0) - (b.lastYearTime == null ? 1 : 0);
    }
    return a.lastYearTime - b.lastYearTime;
  };
  const pinned = new Set<string>();
  for (const group of [...input.groups].sort((a, b) => a.id - b.id)) {
    const members = entries
      .filter((entry) => entry.groupId === group.id && bib.get(entry.runnerId) != null)
      .sort((a, b) => a.groupOrder - b.groupOrder || byName(a, b));
    if (members.length < 2) {
      continue;
    }
    const joint = group.kind === "joint";
    const memberIds = new Set(members.map((entry) => entry.runnerId));
    const movable = (entry: GeneratorEntry) =>
      reason.get(entry.runnerId) === "category" && !pinned.has(entry.runnerId);
    // Cílové časy (pořadí ve startu) pro kotvu: navazující start = kotva + k; společný start =
    // stejný čas, ale na jeden čas se vejdou jen dva (dva paralelní starty), další jdou hned za ně.
    const targetsFor = (anchor: number): number[] =>
      members.map((_, k) => anchor + (joint ? Math.floor(k / 2) : k));

    type Candidate = { value: number; range: BibRange; relocate: boolean };
    /**
     * Čísla, která člen může dostat: volné číslo v okně libovolné kategorie, vlastní číslo, nebo
     * číslo běžce mimo skupinu, který se dá posunout – v rámci téhož okna výměnou, jinak na volné
     * číslo v jeho vlastním okně (`relocate`). Běžec mimo skupinu tak nikdy neopustí svoje okno.
     */
    const candidates = (
      entry: GeneratorEntry,
      taken: Set<number>,
      used: Map<string, number>,
    ): Candidate[] => {
      const currentRange = rangeOfBib(bib.get(entry.runnerId)!);
      const out: Candidate[] = [];
      for (const range of input.ranges) {
        const free = freeByCategory.get(range.categoryId) ?? new Set<number>();
        let spare: number | null = null;
        for (let value = range.bibFrom; value <= range.bibTo; value += 1) {
          if (taken.has(value)) {
            continue;
          }
          const holder = occupied.get(value);
          if (holder === undefined) {
            if (free.has(value)) {
              out.push({ value, range, relocate: false });
            }
            continue;
          }
          if (holder === entry.runnerId) {
            out.push({ value, range, relocate: false });
            continue;
          }
          const other = entryById.get(holder);
          if (!other || memberIds.has(holder) || !movable(other)) {
            continue;
          }
          if (currentRange === range) {
            out.push({ value, range, relocate: false });
            continue;
          }
          spare ??=
            [...free].filter((v) => !taken.has(v)).length - (used.get(range.categoryId) ?? 0);
          if (spare > 0) {
            out.push({ value, range, relocate: true });
          }
        }
      }
      return out;
    };
    /** 0 = vlastní okno, 1 = jiné okno ve stejném startu, 2 = druhý start. */
    const placement = (entry: GeneratorEntry, value: number): number =>
      inOwnWindow(entry, value) ? 0 : startSeriesForBib(model, value) === ownSeries(entry) ? 1 : 2;
    const score = (entry: GeneratorEntry, candidate: Candidate, desired: number): number =>
      Math.abs(startSlot(model, candidate.value) - desired) * 1e8 +
      placement(entry, candidate.value) * 1e6 +
      (candidate.relocate ? 1e5 : 0) +
      Math.abs(candidate.value - bib.get(entry.runnerId)!);

    type Plan = {
      cost: number;
      outside: number;
      disruption: number;
      picks: Map<string, Candidate>;
    };
    const plan = (anchor: number): Plan => {
      const targets = targetsFor(anchor);
      const pool = [...targets];
      const taken = new Set<number>();
      const used = new Map<string, number>();
      const picks = new Map<string, Candidate>();
      const result: Plan = { cost: 0, outside: 0, disruption: 0, picks };
      const takeTarget = (slot: number, k: number): number => {
        if (!joint) {
          return targets[k];
        }
        let best = 0;
        pool.forEach((value, i) => {
          if (Math.abs(value - slot) < Math.abs(pool[best] - slot)) {
            best = i;
          }
        });
        return pool.splice(best, 1)[0] ?? slot;
      };
      const nearestTarget = (slot: number, k: number): number =>
        joint
          ? pool.reduce(
              (best, value) => (Math.abs(value - slot) < Math.abs(best - slot) ? value : best),
              pool[0] ?? slot,
            )
          : targets[k];
      const commit = (entry: GeneratorEntry, k: number, candidate: Candidate) => {
        const slot = startSlot(model, candidate.value);
        const desired = takeTarget(slot, k);
        taken.add(candidate.value);
        if (candidate.relocate) {
          used.set(candidate.range.categoryId, (used.get(candidate.range.categoryId) ?? 0) + 1);
        }
        picks.set(entry.runnerId, candidate);
        result.cost += Math.abs(slot - desired);
        result.outside += inOwnWindow(entry, candidate.value) ? 0 : 1;
        result.disruption += Math.abs(candidate.value - bib.get(entry.runnerId)!);
      };
      const best = (
        entry: GeneratorEntry,
        k: number,
        accept: (candidate: Candidate) => boolean,
      ): Candidate | null => {
        let chosen: Candidate | null = null;
        let chosenScore = Number.POSITIVE_INFINITY;
        for (const candidate of candidates(entry, taken, used)) {
          if (!accept(candidate)) {
            continue;
          }
          const value = score(
            entry,
            candidate,
            nearestTarget(startSlot(model, candidate.value), k),
          );
          if (value < chosenScore) {
            chosen = candidate;
            chosenScore = value;
          }
        }
        return chosen;
      };
      // Pevní členové (zamčení, obhájci, pořadatelé, už umístění v jiné skupině) se nehýbou.
      members.forEach((entry, k) => {
        if (!movable(entry)) {
          const current = bib.get(entry.runnerId)!;
          const slot = startSlot(model, current);
          result.cost += Math.abs(slot - takeTarget(slot, k));
          taken.add(current);
        }
      });
      const movers = members.map((entry, k) => ({ entry, k })).filter((m) => movable(m.entry));
      const rest: typeof movers = [];
      if (joint) {
        // Nejdřív ti, kdo se na cílový čas vejdou ve vlastním okně, pak ostatní kamkoli.
        for (const mover of movers) {
          const pick = best(
            mover.entry,
            mover.k,
            (c) => inOwnWindow(mover.entry, c.value) && pool.includes(startSlot(model, c.value)),
          );
          if (pick) {
            commit(mover.entry, mover.k, pick);
          } else {
            rest.push(mover);
          }
        }
      } else {
        rest.push(...movers);
      }
      for (const { entry, k } of rest) {
        const pick = best(entry, k, () => true);
        if (pick) {
          commit(entry, k, pick);
        } else {
          takeTarget(Number.NaN, k);
          result.cost += 1000;
        }
      }
      return result;
    };

    // Kotva skupiny: podle pevných členů, jinak podle „hostitele“ – člena z kategorie, kam patří
    // většina skupiny (při shodě kategorie nejlépe nasazeného člena). Hostitel zůstává ve svém
    // okně, ostatní členové se k němu přesunou (případně do okna jiné kategorie).
    const fixed = members.map((entry, k) => ({ entry, k })).filter(({ entry }) => !movable(entry));
    let anchors: number[];
    if (fixed.length > 0) {
      const spread = joint ? Math.ceil(members.length / 2) - 1 : 0;
      const options = fixed.map(({ entry, k }) => {
        const slot = startSlot(model, bib.get(entry.runnerId)!);
        return joint ? Array.from({ length: spread + 1 }, (_, j) => slot - j) : [slot - k];
      });
      const common = options[0].filter((anchor) => options.every((o) => o.includes(anchor)));
      if (common.length === 0) {
        warnings.push({ code: "groupLockedConflict", groupId: group.id });
      }
      anchors = common.length > 0 ? common : [...new Set(options.flat())];
    } else {
      const counts = new Map<string, number>();
      for (const entry of members) {
        counts.set(entry.categoryId, (counts.get(entry.categoryId) ?? 0) + 1);
      }
      const hostIndex = members
        .map((entry, k) => ({ entry, k }))
        .sort(
          (a, b) =>
            counts.get(b.entry.categoryId)! - counts.get(a.entry.categoryId)! ||
            compareSeed(a.entry, b.entry) ||
            a.k - b.k,
        )[0].k;
      const host = members[hostIndex];
      const offset = joint ? 0 : hostIndex;
      anchors = [
        ...new Set(
          candidates(host, new Set(), new Map())
            .filter((c) => inOwnWindow(host, c.value))
            .map((c) => startSlot(model, c.value) - offset),
        ),
      ];
      if (anchors.length === 0) {
        anchors = [
          ...new Set(
            members.flatMap((entry, k) =>
              candidates(entry, new Set(), new Map()).map(
                (c) => startSlot(model, c.value) - (joint ? 0 : k),
              ),
            ),
          ),
        ];
      }
    }
    let chosen: Plan | null = null;
    for (const anchor of anchors.sort((a, b) => a - b)) {
      const candidate = plan(anchor);
      if (
        !chosen ||
        candidate.cost < chosen.cost ||
        (candidate.cost === chosen.cost &&
          (candidate.outside < chosen.outside ||
            (candidate.outside === chosen.outside && candidate.disruption < chosen.disruption)))
      ) {
        chosen = candidate;
      }
    }
    if (!chosen) {
      continue;
    }
    const release = (entry: GeneratorEntry, value: number) => {
      if (occupied.get(value) === entry.runnerId) {
        occupied.delete(value);
      }
      const range = rangeOfBib(value);
      if (range) {
        freeByCategory.get(range.categoryId)?.add(value);
      }
    };
    for (const entry of members) {
      const pick = chosen.picks.get(entry.runnerId);
      const current = bib.get(entry.runnerId)!;
      if (pick === undefined || pick.value === current) {
        pinned.add(entry.runnerId);
        continue;
      }
      const target = pick.value;
      const free = freeByCategory.get(pick.range.categoryId)!;
      const holder = occupied.get(target);
      if (holder !== undefined && holder !== entry.runnerId) {
        const other = entryById.get(holder)!;
        if (rangeOfBib(current) === pick.range) {
          assign(other, current, "category");
        } else {
          // Běžec mimo skupinu zůstane ve svém okně – na nejbližší volné číslo.
          let spare: number | null = null;
          for (const value of free) {
            if (spare == null || Math.abs(value - target) < Math.abs(spare - target)) {
              spare = value;
            }
          }
          if (spare == null) {
            pinned.add(entry.runnerId);
            continue;
          }
          free.delete(spare);
          assign(other, spare, "category");
          release(entry, current);
        }
      } else {
        free.delete(target);
        release(entry, current);
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

  const lines: ProposedLine[] = entries.map((entry) => {
    const value = bib.get(entry.runnerId) ?? null;
    const why = reason.get(entry.runnerId) ?? "unassigned";
    return {
      runnerId: entry.runnerId,
      bib: value,
      previousBib: entry.currentBib,
      reason: why,
      outsideCategory:
        value != null && why !== "champion" && why !== "organizer" && !inOwnWindow(entry, value),
    };
  });
  const blocking = warnings.some(
    (warning) => warning.code === "shortage" || warning.code === "noRange",
  );
  const changed = lines.filter((line) => line.bib !== line.previousBib).length;
  return { lines, categories, warnings, blocking, changed };
}
