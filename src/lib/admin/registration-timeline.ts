/**
 * Vývoj přihlášek podle počtu dní do závodu (#145) – čisté výpočty bez DB.
 *
 * - Ročníky se zarovnávají podle dní do závodu (`mcvv_info.datum`), ne podle kalendáře:
 *   závod je vždy první neděli v prosinci, takže se data mezi roky posouvají.
 * - Přihláška se počítá ke dni svého založení (`mcvv_prihlaska.created`); běžci přihlášky
 *   (řádky `mcvv_prihlaska_radek`) ke stejnému dni. `mcvv_prihlaska_radek.created` se
 *   nepoužívá – v legacy datech je hromadně přepsaný těsně před závodem.
 * - Počítají se jen platné přihlášky: stav 2–5 (nezaplacená, zaplacená, přeplatek,
 *   potvrzená) s alespoň jedním běžcem. Zrušené (0), prázdné (1) a neznámý stav ne.
 * - Den přihlášky = kalendářní datum `created` tak, jak ho ukazuje seznam přihlášek
 *   (`dateInputValue`); „dnes“ = kalendářní den v Europe/Prague.
 */

export type TimelineMetric = "runners" | "registrations";

export const COUNTED_STATUSES: readonly number[] = [2, 3, 4, 5];

/** Ročníky s netypickým průběhem (covid: přihlášky ještě po termínu závodu). */
export const ANOMALOUS_YEARS: readonly number[] = [2020];

/** Nejvzdálenější sledovaný den před závodem; starší přihlášky se počítají do tohoto dne. */
export const MAX_HORIZON = 120;

/** Počet ukončených ročníků, ze kterých se počítá predikce. */
export const REFERENCE_YEAR_COUNT = 5;

/** Pod tímto podílem (medián) nebo počtem je predikce jen orientační. */
export const RELIABLE_MIN_SHARE = 0.1;
export const RELIABLE_MIN_COUNT = 20;

const DAY_MS = 86_400_000;

export type TimelineRegistration = {
  year: number;
  status: number | null;
  created: Date | null;
  runners: number;
};

export type TimelineEdition = {
  year: number;
  /** Datum závodu `YYYY-MM-DD`. */
  raceDate: string;
  /** Uzávěrka přihlášek `YYYY-MM-DD`, pokud je známá. */
  deadline: string | null;
};

export type YearSeries = {
  year: number;
  raceDate: string;
  /** Uzávěrka jako počet dní před závodem. */
  deadlineDay: number | null;
  /** Kumulativně: index `d` = počet přihlášených nejpozději `d` dní před závodem (0…MAX_HORIZON). */
  runners: number[];
  registrations: number[];
  /** Nejvzdálenější den před závodem s platnou přihláškou. */
  firstDay: number | null;
  /** Platné přihlášky bez data založení (v grafu vynechané). */
  missingCreated: number;
  /** Platné přihlášky založené po dni závodu (v grafu vynechané). */
  afterRace: number;
  /** Ročník má aspoň jednu platnou přihlášku s datem. */
  hasData: boolean;
};

export function isCountedRegistration(status: number | null | undefined, runners: number): boolean {
  return status != null && COUNTED_STATUSES.includes(status) && runners > 0;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Kalendářní datum `YYYY-MM-DD` z UTC složek (stejně jako `dateInputValue` v seznamu). */
export function utcDateKey(value: Date): string {
  return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`;
}

/** Dnešní kalendářní den v Europe/Prague jako `YYYY-MM-DD`. */
export function pragueDateKey(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Prague",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

function keyToUtc(key: string): number {
  const [year, month, day] = key.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

/** Počet dní od `fromKey` do `toKey` (kladný, když `fromKey` je dřív). */
export function dayDiff(fromKey: string, toKey: string): number {
  return Math.round((keyToUtc(toKey) - keyToUtc(fromKey)) / DAY_MS);
}

/** Kalendářní datum `days` dní před `raceDate`. */
export function dateBeforeRace(raceDate: string, days: number): string {
  return utcDateKey(new Date(keyToUtc(raceDate) - days * DAY_MS));
}

/** Kumulativní řada jednoho ročníku. */
export function buildYearSeries(
  edition: TimelineEdition,
  registrations: readonly TimelineRegistration[],
  horizon: number = MAX_HORIZON,
): YearSeries {
  const runnerBuckets = new Array<number>(horizon + 1).fill(0);
  const registrationBuckets = new Array<number>(horizon + 1).fill(0);
  let missingCreated = 0;
  let afterRace = 0;
  let firstDay: number | null = null;
  for (const registration of registrations) {
    if (registration.year !== edition.year) continue;
    if (!isCountedRegistration(registration.status, registration.runners)) continue;
    if (!registration.created || Number.isNaN(registration.created.getTime())) {
      missingCreated += 1;
      continue;
    }
    const day = dayDiff(utcDateKey(registration.created), edition.raceDate);
    if (day < 0) {
      afterRace += 1;
      continue;
    }
    firstDay = firstDay === null ? day : Math.max(firstDay, day);
    const index = Math.min(day, horizon);
    runnerBuckets[index] += registration.runners;
    registrationBuckets[index] += 1;
  }
  const runners = new Array<number>(horizon + 1).fill(0);
  const counted = new Array<number>(horizon + 1).fill(0);
  let runningRunners = 0;
  let runningRegistrations = 0;
  for (let day = horizon; day >= 0; day -= 1) {
    runningRunners += runnerBuckets[day];
    runningRegistrations += registrationBuckets[day];
    runners[day] = runningRunners;
    counted[day] = runningRegistrations;
  }
  return {
    year: edition.year,
    raceDate: edition.raceDate,
    deadlineDay: edition.deadline ? dayDiff(edition.deadline, edition.raceDate) : null,
    runners,
    registrations: counted,
    firstDay,
    missingCreated,
    afterRace,
    hasData: firstDay !== null,
  };
}

/** Kumulativní hodnota v den `day` před závodem (nad horizontem = hodnota horizontu). */
export function valueAt(series: YearSeries, metric: TimelineMetric, day: number): number {
  const values = series[metric];
  if (day < 0) return values[0];
  return values[Math.min(day, values.length - 1)];
}

export function finalValue(series: YearSeries, metric: TimelineMetric): number {
  return series[metric][0];
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Srovnávací ročníky pro predikci: posledních `count` ukončených ročníků před `currentYear`
 * s daty, bez netypických ročníků (2020).
 */
export function pickReferenceYears(
  series: readonly YearSeries[],
  currentYear: number,
  count: number = REFERENCE_YEAR_COUNT,
  exclude: readonly number[] = ANOMALOUS_YEARS,
): YearSeries[] {
  return series
    .filter((row) => row.year < currentYear && row.hasData && !exclude.includes(row.year))
    .sort((a, b) => b.year - a.year)
    .slice(0, count);
}

/** Stav ročníku vůči dnešku: dny do závodu, nebo že závod už proběhl. */
export function daysToRace(todayKey: string, raceDate: string): number {
  return dayDiff(todayKey, raceDate);
}

export type PredictionReference = {
  year: number;
  /** Podíl konečného počtu, který ročník měl ve stejný den před závodem. */
  share: number;
  /** Odhad z tohoto ročníku: letos / podíl. */
  predicted: number;
};

export type Prediction = {
  day: number;
  current: number;
  point: number;
  min: number;
  max: number;
  medianShare: number;
  reliable: boolean;
  references: PredictionReference[];
};

/**
 * Predikce konečného počtu: pro každý srovnávací ročník X se spočte podíl
 * `p_X(d) = X(d) / X(0)`, odhad `letos(d) / p_X(d)`; bodový odhad = medián odhadů,
 * rozpětí = min–max. Vrací `null`, když predikce nedává smysl: den závodu nebo po něm,
 * po uzávěrce přihlášek, letos zatím nikdo, nebo chybí srovnávací ročníky.
 */
export function predictFinal(
  current: YearSeries,
  references: readonly YearSeries[],
  day: number,
  metric: TimelineMetric,
): Prediction | null {
  if (day <= 0) return null;
  if (current.deadlineDay !== null && day < current.deadlineDay) return null;
  const now = valueAt(current, metric, day);
  if (now <= 0) return null;
  const rows: PredictionReference[] = [];
  for (const reference of references) {
    const total = finalValue(reference, metric);
    const share = total > 0 ? valueAt(reference, metric, day) / total : 0;
    if (share <= 0) continue;
    rows.push({ year: reference.year, share, predicted: now / share });
  }
  if (rows.length === 0) return null;
  const predictions = rows.map((row) => row.predicted);
  const medianShare = median(rows.map((row) => row.share));
  return {
    day,
    current: now,
    point: Math.max(now, Math.round(median(predictions))),
    min: Math.max(now, Math.round(Math.min(...predictions))),
    max: Math.max(now, Math.round(Math.max(...predictions))),
    medianShare,
    reliable: medianShare >= RELIABLE_MIN_SHARE && now >= RELIABLE_MIN_COUNT,
    references: rows,
  };
}

export type ProjectionPoint = { day: number; point: number; min: number; max: number };

/**
 * Čárkované pokračování aktuální křivky od dneška (`prediction.day`) do dne závodu.
 * Tvar podle mediánu podílů srovnávacích ročníků, takže začíná v dnešní hodnotě
 * a končí v bodovém odhadu (pruh v min / max).
 */
export function projectionCurve(
  prediction: Prediction,
  references: readonly YearSeries[],
  metric: TimelineMetric,
): ProjectionPoint[] {
  const used = references.filter((row) =>
    prediction.references.some((reference) => reference.year === row.year),
  );
  const shareAt = (day: number) =>
    median(used.map((row) => valueAt(row, metric, day) / finalValue(row, metric)));
  const start = shareAt(prediction.day);
  const points: ProjectionPoint[] = [];
  for (let day = prediction.day; day >= 0; day -= 1) {
    const progress =
      start < 1 ? (shareAt(day) - start) / (1 - start) : (prediction.day - day) / prediction.day;
    const toward = (target: number) =>
      Math.round(prediction.current + (target - prediction.current) * progress);
    points.push({
      day,
      point: toward(prediction.point),
      min: toward(prediction.min),
      max: toward(prediction.max),
    });
  }
  return points;
}

export type SameDayComparison = {
  day: number;
  current: number;
  lastYear: { year: number; value: number; diffPct: number | null } | null;
  average: number | null;
};

/** „Letos N, loni ve stejné době M (± x %)“ a průměr srovnávacích ročníků ke stejnému dni. */
export function sameDayComparison(
  current: YearSeries,
  previous: readonly YearSeries[],
  references: readonly YearSeries[],
  day: number,
  metric: TimelineMetric,
): SameDayComparison {
  const now = valueAt(current, metric, day);
  const last = previous
    .filter((row) => row.year < current.year && row.hasData)
    .sort((a, b) => b.year - a.year)[0];
  const lastValue = last ? valueAt(last, metric, day) : null;
  const average =
    references.length > 0
      ? Math.round(
          references.reduce((sum, row) => sum + valueAt(row, metric, day), 0) / references.length,
        )
      : null;
  return {
    day,
    current: now,
    lastYear:
      last && lastValue !== null
        ? {
            year: last.year,
            value: lastValue,
            diffPct: lastValue > 0 ? Math.round(((now - lastValue) / lastValue) * 100) : null,
          }
        : null,
    average,
  };
}

/** Začátek osy X: nejvzdálenější první přihláška vybraných ročníků, zaokrouhleno na 10. */
export function chartStartDay(series: readonly YearSeries[], minimum = 30): number {
  const first = Math.max(minimum, ...series.map((row) => row.firstDay ?? 0));
  return Math.min(MAX_HORIZON, Math.ceil(first / 10) * 10);
}

export type ChartRow = {
  /** Záporný počet dní do závodu (osa X zleva doprava k 0). */
  day: number;
  forecast?: number;
  forecastRange?: [number, number];
} & Record<`y${number}`, number | null>;

/**
 * Řádky grafu: jeden na den před závodem. Aktuální ročník končí dneškem (`currentDay`),
 * dál pokračuje predikce.
 */
export function chartRows(
  series: readonly YearSeries[],
  metric: TimelineMetric,
  startDay: number,
  current: { year: number; day: number | null } | null,
  projection: readonly ProjectionPoint[] = [],
): ChartRow[] {
  const projectionByDay = new Map(projection.map((point) => [point.day, point]));
  const rows: ChartRow[] = [];
  for (let day = startDay; day >= 0; day -= 1) {
    const row = { day: day === 0 ? 0 : -day } as ChartRow;
    for (const item of series) {
      const cut =
        current && item.year === current.year && current.day !== null && day < current.day;
      row[`y${item.year}`] = cut ? null : valueAt(item, metric, day);
    }
    const point = projectionByDay.get(day);
    if (point) {
      row.forecast = point.point;
      row.forecastRange = [point.min, point.max];
    }
    rows.push(row);
  }
  return rows;
}

/** Roky bez dat do zkráceného textu: `[2001, 2002, 2003, 2005]` → `2001–2003, 2005`. */
export function formatYearRanges(years: readonly number[]): string {
  const sorted = [...new Set(years)].sort((a, b) => a - b);
  const parts: string[] = [];
  let start: number | null = null;
  let previous: number | null = null;
  for (const year of [...sorted, Number.NaN]) {
    if (start !== null && previous !== null && year === previous + 1) {
      previous = year;
      continue;
    }
    if (start !== null && previous !== null) {
      parts.push(start === previous ? String(start) : `${start}–${previous}`);
    }
    start = year;
    previous = year;
  }
  return parts.join(", ");
}
