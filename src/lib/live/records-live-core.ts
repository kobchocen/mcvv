/**
 * Nový traťový rekord živě (speaker, resultboard, online výsledky) – čistá logika bez DB
 * a prohlížečových API.
 *
 * Server ke snímku přidá `tr`: kdo právě drží (nebo vyrovnal) rekord absolutní kategorie
 * svého pohlaví (muži / ženy, `age === 0`) a své kategorie. Výchozí rekord se počítá stejným
 * pravidlem jako `cis_mcvv_kateg.rekord` (`categoryRecord`, nejlepší čas mezi běžci, kteří do
 * kategorie patří podle pohlaví a věku), jen z ročníků **před** probíhajícím – import
 * konečných výsledků ve dni závodu tak živý rekord „sám se sebou“ nevyrovná (Q162: držitel
 * a rok jen v paměti, bez nového sloupce). Eligibility se počítá na serveru – ID běžců ani
 * ročníky narození klient nedostane.
 *
 * Hlídá se jen cílový čas (Q158). Vyrovnání je slabší varianta a rekord nemění (Q157).
 * Prohlížeč porovná po sobě jdoucí snímky (jako „nový lídr“): první snímek, mezera ve
 * spojení a dodatečně zapsané časy jen nastaví výchozí stav (Q164).
 */
import { isEligibleByBirthYear } from "@/lib/entries/category";
import { runnerBirthYear, runnerSex } from "@/lib/stats/core";
import { categoryRecord, type RecordCategory, type RecordResult } from "@/lib/stats/records-core";

/** Dosavadní rekord kategorie: čas (s), držitel a ročník (null = neznámý). */
export type RecordHolder = { time: number; who: string | null; year: number | null };

/** Výchozí rekordy podle id kategorie (jen kategorie s aspoň jedním platným výsledkem). */
export type RecordBaselines = ReadonlyMap<string, RecordHolder>;

export type TrMark = {
  bib: number;
  /** Id kategorie, jejíž rekord padl. */
  rec: string;
  /** Absolutní rekord (muži / ženy) – hlavní (Q159). */
  abs: boolean;
  /** Jen vyrovnaný (slabší varianta, Q157). */
  eq: boolean;
  /** Cílový čas (s). */
  time: number;
  /** Okamžik doběhu (epoch s). */
  at: number;
  /** Rekord před tímhle doběhem (může být i dnešní). */
  prev: RecordHolder;
};

/**
 * Výchozí rekordy pro ročník `raceYear`: z výsledků všech dřívějších ročníků. `nameOf` vrací
 * jméno držitele (jak je ve výsledcích).
 */
export function recordBaselines<T extends RecordResult>(
  categories: readonly RecordCategory[],
  results: readonly T[],
  raceYear: number,
  nameOf: (result: T) => string | null,
): Map<string, RecordHolder> {
  const before = results.filter((r) => r.year < raceYear);
  const out = new Map<string, RecordHolder>();
  for (const category of categories) {
    const best = categoryRecord(category, before);
    if (best) out.set(category.id, { time: best.time, who: nameOf(best), year: best.year });
  }
  return out;
}

export type TrRunner = {
  bib: number;
  name: string;
  cat: string;
  start: number;
  fin: number | null;
  /** `cis_bezec.id` – jen na serveru. */
  runnerId: string;
};

/**
 * Kdo v probíhajícím ročníku drží (nebo vyrovnal) rekord. Doběhy se procházejí v pořadí, jak
 * proběhly cílem; rychlejší než dosavadní = nový rekord, shodný = vyrovnaný. Výsledek jen
 * pro platný (nejlepší) dnešní čas – kdo rekord překonal a pak ho někdo zlepšil, odznak ztratí.
 */
export function liveRecordMarks(
  runners: readonly TrRunner[],
  categories: readonly RecordCategory[],
  baselines: RecordBaselines,
  raceYear: number,
): TrMark[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const absBySex = new Map<string, RecordCategory>();
  for (const c of categories) if (c.age === 0 && !absBySex.has(c.sex)) absBySex.set(c.sex, c);

  const lanes = new Map<string, { r: TrRunner; at: number }[]>();
  for (const r of runners) {
    if (r.fin == null || r.fin <= 0) continue;
    const own = byId.get(r.cat);
    if (!own) continue;
    const sex = runnerSex(r.runnerId);
    const birth = runnerBirthYear(r.runnerId);
    const abs = absBySex.get(sex);
    for (const rec of new Set([abs, own])) {
      if (!rec || !baselines.has(rec.id)) continue;
      if (!isEligibleByBirthYear(birth, sex, raceYear, rec)) continue;
      const lane = lanes.get(rec.id) ?? [];
      lane.push({ r, at: r.start + r.fin });
      lanes.set(rec.id, lane);
    }
  }

  const marks: TrMark[] = [];
  for (const [recId, lane] of lanes) {
    const rec = byId.get(recId)!;
    lane.sort((a, b) => a.at - b.at || a.r.bib - b.r.bib);
    let best: RecordHolder = baselines.get(recId)!;
    let held: TrMark[] = [];
    for (const { r, at } of lane) {
      const time = r.fin!;
      if (time > best.time) continue;
      const eq = time === best.time;
      const mark: TrMark = { bib: r.bib, rec: recId, abs: rec.age === 0, eq, time, at, prev: best };
      if (eq) {
        held.push(mark);
      } else {
        held = [mark];
        best = { time, who: r.name, year: raceYear };
      }
    }
    marks.push(...held);
  }
  return marks.sort((a, b) => a.at - b.at || a.bib - b.bib || Number(b.abs) - Number(a.abs));
}

/* ---------- prohlížeč: události mezi snímky ---------- */

/** Doběh starší než tohle v okamžiku zjištění = dodatečný (zpětný dovoz) → bez překryvu. */
export const TR_LATE_S = 300;
/** Mezera mezi snímky delší než tohle (výpadek, uspaná záložka) → jen nový výchozí stav. */
export const TR_GAP_MS = 60_000;
/** Víc karet naráz než tohle → jedna souhrnná karta (Q164). */
export const TR_SUMMARY_OVER = 3;

/** Jedna karta: běžec, hlavní rekord (absolutní před kategoriovým, nový před vyrovnaným). */
export type TrCard = { bib: number; time: number; main: TrMark; extra: TrMark[] };

const markKey = (m: TrMark) => `${m.bib}|${m.rec}|${m.eq ? "=" : "!"}|${m.time}`;

/** Pořadí důležitosti: nový absolutní > nový kategorie > vyrovnaný absolutní > vyrovnaný. */
export function markRank(m: TrMark): number {
  return (m.eq ? 2 : 0) + (m.abs ? 0 : 1);
}

/** Značky seskupené po běžcích do karet (v pořadí doběhu). */
export function cardsOf(marks: readonly TrMark[]): TrCard[] {
  const byBib = new Map<number, TrMark[]>();
  for (const m of marks) byBib.set(m.bib, [...(byBib.get(m.bib) ?? []), m]);
  return [...byBib.values()]
    .map((list) => {
      const sorted = [...list].sort((a, b) => markRank(a) - markRank(b));
      return { bib: sorted[0].bib, time: sorted[0].time, main: sorted[0], extra: sorted.slice(1) };
    })
    .sort((a, b) => a.main.at - b.main.at || a.bib - b.bib);
}

export type TrTracker = {
  keys: ReadonlySet<string> | null;
  seenMs: number;
};

export const emptyTrTracker = (): TrTracker => ({ keys: null, seenMs: 0 });

/**
 * Nový snímek → karty k zobrazení. První snímek, snímek po dlouhé mezeře a doběhy starší než
 * `TR_LATE_S` nic nespustí (odznak v tabulce ale ukážou vždy).
 */
export function trackRecords(
  tracker: TrTracker,
  marks: readonly TrMark[],
  nowMs: number,
): { tracker: TrTracker; cards: TrCard[] } {
  const keys = new Set(marks.map(markKey));
  const gap = tracker.keys !== null && nowMs - tracker.seenMs > TR_GAP_MS;
  const next = { keys, seenMs: nowMs };
  if (!tracker.keys || gap) return { tracker: next, cards: [] };
  const nowS = nowMs / 1000;
  const fresh = marks.filter((m) => !tracker.keys!.has(markKey(m)) && nowS - m.at <= TR_LATE_S);
  return { tracker: next, cards: cardsOf(fresh) };
}

/** Odznak v tabulce: číslo → „TR“ (nový) nebo „= TR“ (jen vyrovnaný). */
export function badgesOf(marks: readonly TrMark[]): Map<number, "tr" | "eq"> {
  const out = new Map<number, "tr" | "eq">();
  for (const m of marks) if (!m.eq || !out.has(m.bib)) out.set(m.bib, m.eq ? "eq" : "tr");
  return out;
}
