import {
  inAnySpecialRange,
  offsetSlots,
  RANGED_SPECIAL_KINDS,
  SPECIAL_SLOT_RANGES,
  type RangedSpecialKind,
  type SpecialStartSpec,
} from "./special-start";
import type { BibRange } from "./start-settings";
import { bibForSlot, startSeriesForBib, startSlot, type StartModel } from "./start-time";

/**
 * Návrh startovky (#115) – deterministický, žádné losování. Pravidla (Pavel, 20. 10. 2026,
 * spec. starty 2. 11. 2026, Q220–Q237):
 *
 * a) spec. starty s rozsahem (viz `special-start.ts`) dostanou čísla ve svém rozsahu ve startu
 *    své kategorie, postupně podle pořadí kategorií a jména: pořadatel 1–40 / 601–640,
 *    brzy 41–99 / 641–699, pozdě 261–299 / 861–899 (pozdě plní rozsah od konce). Pořadatel
 *    je jen běžec se spec. startem „pořadatel“ (přihláška č. 1 už nic neurčuje). Když rozsah
 *    nestačí, zbytek dostane nejbližší volná čísla mimo rozsah a generátor upozorní (Q237).
 *    Běžci „spolu s“, kteří se k nim (i přes další běžce) váží, jdou s nimi (Q227);
 * b) v okně kategorie (rozsah čísel ročníku) se ostatní běžci rozprostřou rovnoměrně kolem
 *    již obsazených čísel, bez velkých děr;
 * c) nejdřív nováčci a běžci bez loňského času (podle jména), pak vracející se podle loňského
 *    času od nejpomalejšího – nejrychlejší startují na konci, závod graduje;
 * d) „spolu s“ (náhrada dřívějších skupin, Q225): čas partnera + posun (libovolný násobek
 *    intervalu, i záporný), ve vlastním nebo druhém startu (posun 0 = druhý start). Když je
 *    přesný čas obsazený, nejbližší volné číslo a upozornění; běžce z kategorie smí posunout
 *    v rámci jeho okna. Partner chybí / nemá číslo → běžné umístění a upozornění (Q226);
 * e) zamčená (ručně změněná) čísla zůstanou beze změny a nikdo jiný je nedostane;
 * f) generátor nic nezveřejňuje – vrací jen návrh, ukládá se samostatně.
 *
 * Obhájci (absolutní vítězové minulého ročníku) dostanou číslo obhájce z nastavení ročníku.
 * Čísla mimo okna kategorií a rozsahy spec. startů (rezerva) generátor nepřiděluje.
 */

export type GeneratorEntry = {
  runnerId: string;
  name: string;
  categoryId: string;
  /** Číslo uložené v DB (jen pro rozdíl a pro zamčené řádky). */
  currentBib: number | null;
  locked: boolean;
  /** Platná (zaplacená / potvrzená, nezrušená) přihláška – jen ty dostanou číslo. */
  eligible: boolean;
  /** Loňský čas v sekundách, null = nováček nebo loni neběžel. */
  lastYearTime: number | null;
  /** Spec. start z administrace přihlášek (null / chybí = žádný). */
  special?: SpecialStartSpec | null;
};

export type GeneratorInput = {
  model: StartModel;
  ranges: BibRange[];
  /** Pořadí kategorií (cis_mcvv_kateg.sort) pro řazení v rozsazích spec. startů. */
  categorySort: Record<string, number>;
  champions: { runnerId: string; bib: number }[];
  entries: GeneratorEntry[];
  locale?: string;
};

export type AssignmentReason =
  | "locked"
  | "champion"
  | "organizer"
  | "category"
  | "early"
  | "late"
  | "with"
  | "ineligible"
  | "unassigned";

export type ProposedLine = {
  runnerId: string;
  bib: number | null;
  previousBib: number | null;
  reason: AssignmentReason;
  /** Číslo leží mimo okno vlastní kategorie (jen informace – spolu s, ruční úprava). */
  outsideCategory: boolean;
};

export type GeneratorWarning =
  | { code: "shortage"; categoryId: string; runners: number; slots: number }
  | { code: "noRange"; categoryId: string; runners: number }
  | { code: "lockedDuplicate"; bib: number; runnerIds: string[] }
  | { code: "championTaken"; runnerId: string; bib: number }
  /** Rozsah spec. startu je plný → běžci dostali nejbližší volná čísla mimo rozsah (Q237). */
  | { code: "specOverflow"; kind: RangedSpecialKind; series: 1 | 2; runnerIds: string[] }
  /** Spolu s: partner chybí, nemá číslo nebo je to on sám → běžné umístění. */
  | { code: "specPartnerMissing"; runnerId: string; partnerId: string | null }
  /** Spolu s: přesný čas nebyl volný, odchylka v počtu intervalů (-1 = žádné číslo). */
  | { code: "specApprox"; runnerId: string; deviation: number }
  /** Spolu s: kruh požadavků, který nejde splnit celý (první podle id slouží jako kotva). */
  | { code: "specCycle"; runnerIds: string[] };

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

const otherSeries = (series: 1 | 2): 1 | 2 => (series === 1 ? 2 : 1);

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
  const orderBySort = (a: GeneratorEntry, b: GeneratorEntry) =>
    (input.categorySort[a.categoryId] ?? 99) - (input.categorySort[b.categoryId] ?? 99) ||
    byName(a, b);

  const assign = (entry: GeneratorEntry, value: number, why: AssignmentReason) => {
    bib.set(entry.runnerId, value);
    reason.set(entry.runnerId, why);
    occupied.set(value, entry.runnerId);
  };
  const rangeOfBib = (value: number): BibRange | undefined =>
    input.ranges.find((range) => value >= range.bibFrom && value <= range.bibTo);
  const inOwnWindow = (entry: GeneratorEntry, value: number): boolean => {
    const range = rangeByCategory.get(entry.categoryId);
    return !!range && value >= range.bibFrom && value <= range.bibTo;
  };
  const ownSeries = (entry: GeneratorEntry) =>
    rangeSeries(model, rangeByCategory.get(entry.categoryId));
  const championBibs = new Set(input.champions.map((champion) => champion.bib));
  /** Číslo, které generátor smí dát spec. startu: okno kategorie nebo rozsah spec. startu. */
  const placeable = (value: number, series: 1 | 2): boolean =>
    value >= 1 &&
    startSeriesForBib(model, value) === series &&
    !championBibs.has(value) &&
    (rangeOfBib(value) !== undefined || inAnySpecialRange(model, value));

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

  // a) Spec. starty s rozsahem (pořadatel, brzy, pozdě) – před rozprostřením kategorií, aby se
  //    okna rozprostřela kolem nich. Běžci „spolu s“ navázaní na kotvu jdou s ní (Q227).
  const dependentsOf = (anchor: GeneratorEntry): GeneratorEntry[] => {
    const result: GeneratorEntry[] = [];
    const queue = [anchor.runnerId];
    while (queue.length > 0) {
      const partnerId = queue.shift()!;
      const attached = entries
        .filter(
          (entry) =>
            pending(entry) &&
            entry.special?.kind === "with" &&
            entry.special.partnerId === partnerId &&
            entry.runnerId !== anchor.runnerId &&
            !result.includes(entry),
        )
        .sort((a, b) => a.runnerId.localeCompare(b.runnerId));
      for (const entry of attached) {
        result.push(entry);
        queue.push(entry.runnerId);
      }
    }
    return result;
  };
  /** Startovní pořadí „spolu s“ vůči partnerovi: posun 0 = druhý start, jinak nejdřív vlastní. */
  const withSeriesOrder = (entry: GeneratorEntry, partnerBib: number): (1 | 2)[] =>
    offsetSlots(model, entry.special?.offsetSeconds ?? 0) === 0
      ? [otherSeries(startSeriesForBib(model, partnerBib)), startSeriesForBib(model, partnerBib)]
      : [ownSeries(entry), otherSeries(ownSeries(entry))];
  /** Přesná čísla pro navázané běžce, nebo null, když některé není volné. */
  const fitDependents = (
    anchorId: string,
    anchorBib: number,
    dependents: GeneratorEntry[],
  ): Map<string, number> | null => {
    const planned = new Map<string, number>([[anchorId, anchorBib]]);
    const used = new Set<number>([anchorBib]);
    for (const entry of dependents) {
      const partnerBib = planned.get(entry.special!.partnerId!)!;
      const slot = startSlot(model, partnerBib) + offsetSlots(model, entry.special!.offsetSeconds);
      const value = withSeriesOrder(entry, partnerBib)
        .filter((series) => slot >= 1 && placeable(bibForSlot(model, series, slot), series))
        .map((series) => bibForSlot(model, series, slot))
        .find((candidate) => !occupied.has(candidate) && !used.has(candidate));
      if (value === undefined) {
        return null;
      }
      planned.set(entry.runnerId, value);
      used.add(value);
    }
    planned.delete(anchorId);
    return planned;
  };
  const nearestOutside = (kind: RangedSpecialKind, series: 1 | 2): number | null => {
    const range = SPECIAL_SLOT_RANGES[kind];
    // Pozdě hledá při shodě vzdálenosti později, ostatní dřív.
    for (let distance = 1; distance <= 2000; distance += 1) {
      const slots =
        kind === "late"
          ? [range.to + distance, range.from - distance]
          : [range.from - distance, range.to + distance];
      for (const slot of slots) {
        const value = bibForSlot(model, series, slot);
        if (slot >= 1 && placeable(value, series) && !occupied.has(value)) {
          return value;
        }
      }
    }
    return null;
  };
  for (const kind of RANGED_SPECIAL_KINDS) {
    for (const series of [1, 2] as const) {
      const anchors = entries
        .filter(
          (entry) =>
            pending(entry) &&
            entry.special?.kind === kind &&
            rangeSeries(model, rangeByCategory.get(entry.categoryId)) === series,
        )
        .sort(orderBySort);
      // Pozdě plní rozsah od konce (co nejpozději), v pořadí zůstává stabilní řazení.
      const late = kind === "late";
      if (late) {
        anchors.reverse();
      }
      const range = SPECIAL_SLOT_RANGES[kind];
      const slots = Array.from({ length: range.to - range.from + 1 }, (_, i) =>
        late ? range.to - i : range.from + i,
      );
      const overflow: string[] = [];
      for (const anchor of anchors) {
        const dependents = dependentsOf(anchor);
        let firstFree: number | null = null;
        let placed: { value: number; dependents: Map<string, number> } | null = null;
        for (const slot of slots) {
          if (placed) {
            break;
          }
          const value = bibForSlot(model, series, slot);
          if (occupied.has(value) || championBibs.has(value)) {
            continue;
          }
          firstFree ??= value;
          const fit = fitDependents(anchor.runnerId, value, dependents);
          if (fit) {
            placed = { value, dependents: fit };
          }
        }
        if (!placed && firstFree != null) {
          // Kotva se vejde, navázaní ne celí → doplní je krok „spolu s“ (nejbližší volné).
          placed = { value: firstFree, dependents: new Map() };
        }
        if (!placed) {
          const value = nearestOutside(kind, series);
          overflow.push(anchor.runnerId);
          if (value == null) {
            continue;
          }
          placed = {
            value,
            dependents: fitDependents(anchor.runnerId, value, dependents) ?? new Map(),
          };
        }
        assign(anchor, placed.value, kind);
        for (const [runnerId, value] of placed.dependents) {
          assign(entryById.get(runnerId)!, value, "with");
        }
      }
      if (overflow.length > 0) {
        if (late) {
          overflow.reverse();
        }
        warnings.push({ code: "specOverflow", kind, series, runnerIds: overflow });
      }
    }
  }

  // b) + c) Okna kategorií.
  const categories: CategorySummary[] = [];
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

  // d) Spec. start „spolu s“ – v pořadí závislostí (nejdřív partner).
  const withEntries = entries.filter(
    (entry) => entry.special?.kind === "with" && entry.eligible && bib.get(entry.runnerId) != null,
  );
  const withById = new Map(withEntries.map((entry) => [entry.runnerId, entry]));
  // Partnery nikdo neposouvá – jinak by se rozbil čas, ke kterému se jiný běžec váže.
  const partnerIds = new Set(
    withEntries.map((entry) => entry.special?.partnerId).filter((id): id is string => !!id),
  );
  const partnerIdOf = (entry: GeneratorEntry) => entry.special?.partnerId ?? null;
  // Kruhy (A spolu s B, B spolu s A…): kotvou je první podle id, jeho požadavek se neuplatní.
  const cycleAnchors = new Map<string, string[]>();
  for (const start of withEntries) {
    const path: string[] = [];
    let current: GeneratorEntry | undefined = start;
    while (current && !path.includes(current.runnerId)) {
      path.push(current.runnerId);
      const next = partnerIdOf(current);
      current = next ? withById.get(next) : undefined;
    }
    if (current) {
      const loop = path.slice(path.indexOf(current.runnerId)).sort();
      if (![...cycleAnchors.values()].some((members) => members.includes(loop[0]))) {
        cycleAnchors.set(loop[0], loop);
      }
    }
  }
  const depth = new Map<string, number>();
  const depthOf = (entry: GeneratorEntry, seen = new Set<string>()): number => {
    const known = depth.get(entry.runnerId);
    if (known !== undefined) {
      return known;
    }
    const next = partnerIdOf(entry);
    const partner = next ? withById.get(next) : undefined;
    const value =
      cycleAnchors.has(entry.runnerId) || !partner || seen.has(entry.runnerId)
        ? 0
        : depthOf(partner, new Set([...seen, entry.runnerId])) + 1;
    depth.set(entry.runnerId, value);
    return value;
  };
  const withOrder = withEntries
    .filter((entry) => !cycleAnchors.has(entry.runnerId))
    .sort((a, b) => depthOf(a) - depthOf(b) || a.runnerId.localeCompare(b.runnerId));
  const nearestFreeInOwnWindow = (entry: GeneratorEntry, target: number): number | null => {
    const range = rangeByCategory.get(entry.categoryId);
    if (!range) {
      return null;
    }
    let spare: number | null = null;
    for (let value = range.bibFrom; value <= range.bibTo; value += 1) {
      if (
        !occupied.has(value) &&
        value !== target &&
        (spare == null || Math.abs(value - target) < Math.abs(spare - target))
      ) {
        spare = value;
      }
    }
    return spare;
  };
  for (const entry of withOrder) {
    const partnerId = partnerIdOf(entry);
    const partner = partnerId ? entryById.get(partnerId) : undefined;
    const partnerBib = partner ? bib.get(partner.runnerId) : null;
    if (!partner || partner.runnerId === entry.runnerId || partnerBib == null) {
      warnings.push({ code: "specPartnerMissing", runnerId: entry.runnerId, partnerId });
      continue;
    }
    // Zamčený, obhájce, spec. start s rozsahem ani už umístěný (Q227) se nehýbe.
    if (reason.get(entry.runnerId) !== "category") {
      continue;
    }
    const current = bib.get(entry.runnerId)!;
    const desired =
      startSlot(model, partnerBib) + offsetSlots(model, entry.special?.offsetSeconds ?? 0);
    // Stejný čas ve stejném startu nejde – posun 0 = druhý start.
    const seriesOrder = withSeriesOrder(entry, partnerBib);
    type Spot = { value: number; relocate: string | null; deviation: number; rank: number };
    let found: Spot | null = null;
    for (let deviation = 0; deviation <= 1000 && !found; deviation += 1) {
      const slots = deviation === 0 ? [desired] : [desired + deviation, desired - deviation];
      for (const slot of slots) {
        if (slot < 1) {
          continue;
        }
        seriesOrder.forEach((series, seriesRank) => {
          const value = bibForSlot(model, series, slot);
          if (!placeable(value, series)) {
            return;
          }
          if (value === partnerBib) {
            return;
          }
          const holder = occupied.get(value);
          let relocate: string | null = null;
          if (holder !== undefined && holder !== entry.runnerId) {
            const holderEntry = entryById.get(holder);
            if (
              !holderEntry ||
              reason.get(holder) !== "category" ||
              partnerIds.has(holder) ||
              nearestFreeInOwnWindow(holderEntry, value) == null
            ) {
              return;
            }
            relocate = holder;
          }
          const rank = seriesRank * 4 + (inOwnWindow(entry, value) ? 0 : 2) + (relocate ? 1 : 0);
          if (!found || found.deviation > deviation || found.rank > rank) {
            found = { value, relocate, deviation, rank };
          }
        });
      }
    }
    const spot = found as Spot | null;
    if (!spot) {
      warnings.push({ code: "specApprox", runnerId: entry.runnerId, deviation: -1 });
      continue;
    }
    if (spot.value !== current) {
      if (occupied.get(current) === entry.runnerId) {
        occupied.delete(current);
      }
      if (spot.relocate) {
        const moved = entryById.get(spot.relocate)!;
        assign(moved, nearestFreeInOwnWindow(moved, spot.value)!, "category");
      }
    }
    assign(entry, spot.value, "with");
    if (spot.deviation > 0) {
      warnings.push({ code: "specApprox", runnerId: entry.runnerId, deviation: spot.deviation });
    }
  }
  // Kotva kruhu: když po umístění ostatních její požadavek neplatí, upozorní se.
  for (const [anchorId, members] of cycleAnchors) {
    const anchor = entryById.get(anchorId)!;
    const partnerId = partnerIdOf(anchor);
    const own = bib.get(anchorId);
    const other = partnerId ? bib.get(partnerId) : null;
    const satisfied =
      own != null &&
      other != null &&
      startSlot(model, own) - startSlot(model, other) ===
        offsetSlots(model, anchor.special?.offsetSeconds ?? 0);
    if (!satisfied) {
      warnings.push({ code: "specCycle", runnerIds: members });
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
        value != null &&
        why !== "champion" &&
        why !== "organizer" &&
        why !== "early" &&
        why !== "late" &&
        !inOwnWindow(entry, value) &&
        // „Spolu s“ v rozsahu spec. startů (u pořadatele, brzkého…) není „mimo kategorii“.
        !(why === "with" && inAnySpecialRange(model, value)),
    };
  });
  const blocking = warnings.some(
    (warning) => warning.code === "shortage" || warning.code === "noRange",
  );
  const changed = lines.filter((line) => line.bib !== line.previousBib).length;
  return { lines, categories, warnings, blocking, changed };
}
