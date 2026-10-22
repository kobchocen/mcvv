import { prisma } from "@/lib/db/client";
import { firstSundayOfDecember } from "@/lib/date/race-schedule";
import {
  ANOMALOUS_YEARS,
  MAX_HORIZON,
  buildYearSeries,
  daysToRace,
  pickReferenceYears,
  pragueDateKey,
  predictFinal,
  projectionCurve,
  sameDayComparison,
  utcDateKey,
  type Prediction,
  type ProjectionPoint,
  type SameDayComparison,
  type TimelineEdition,
  type TimelineMetric,
  type YearSeries,
} from "@/lib/admin/registration-timeline";

export type TimelineMetricSummary = {
  comparison: SameDayComparison | null;
  prediction: Prediction | null;
  projection: ProjectionPoint[];
};

export type RegistrationTimelineData = {
  currentYear: number;
  todayKey: string;
  /** Dny do závodu vybraného ročníku; `null`, když už proběhl nebo je mimo horizont. */
  currentDay: number | null;
  series: YearSeries[];
  /** Ročníky z `mcvv_info` bez platných přihlášek s datem (v grafu chybí). */
  missingYears: number[];
  referenceYears: number[];
  anomalousYears: number[];
  metrics: Record<TimelineMetric, TimelineMetricSummary>;
};

function fallbackRaceDate(year: number): string {
  return `${year}-12-${String(firstSundayOfDecember(year)).padStart(2, "0")}`;
}

/** Data pro graf vývoje přihlášek (#145) – agregace on-the-fly, pár tisíc řádků. */
export async function loadRegistrationTimeline(
  selectedYear: number,
  now: Date = new Date(),
): Promise<RegistrationTimelineData> {
  const [editions, registrations] = await Promise.all([
    prisma.edition.findMany({ select: { date: true, regDeadline: true }, orderBy: { id: "asc" } }),
    prisma.registration.findMany({
      where: { year: { lte: selectedYear } },
      select: { year: true, status: true, created: true, _count: { select: { lines: true } } },
    }),
  ]);
  const editionByYear = new Map<number, TimelineEdition>();
  for (const edition of editions) {
    const year = edition.date.getUTCFullYear();
    editionByYear.set(year, {
      year,
      raceDate: utcDateKey(edition.date),
      deadline: edition.regDeadline ? utcDateKey(edition.regDeadline) : null,
    });
  }
  if (!editionByYear.has(selectedYear)) {
    editionByYear.set(selectedYear, {
      year: selectedYear,
      raceDate: fallbackRaceDate(selectedYear),
      deadline: null,
    });
  }
  const rows = registrations.map((row) => ({
    year: row.year,
    status: row.status,
    created: row.created,
    runners: row._count.lines,
  }));
  const regYears = new Set(rows.map((row) => row.year));
  for (const year of regYears) {
    if (!editionByYear.has(year)) {
      editionByYear.set(year, { year, raceDate: fallbackRaceDate(year), deadline: null });
    }
  }
  const allSeries = [...editionByYear.values()]
    .filter((edition) => edition.year <= selectedYear)
    .sort((a, b) => a.year - b.year)
    .map((edition) =>
      buildYearSeries(
        edition,
        rows.filter((row) => row.year === edition.year),
      ),
    );
  const current = allSeries.find((row) => row.year === selectedYear)!;
  const missingYears = allSeries
    .filter((row) => !row.hasData && row.year !== selectedYear)
    .map((row) => row.year);
  const series = allSeries.filter((row) => row.hasData || row.year === selectedYear);
  const references = pickReferenceYears(series, selectedYear);
  const todayKey = pragueDateKey(now);
  const remaining = daysToRace(todayKey, current.raceDate);
  const currentDay = remaining >= 0 && remaining <= MAX_HORIZON ? remaining : null;

  const summarize = (metric: TimelineMetric): TimelineMetricSummary => {
    if (currentDay === null) return { comparison: null, prediction: null, projection: [] };
    const prediction = predictFinal(current, references, currentDay, metric);
    return {
      comparison: sameDayComparison(current, series, references, currentDay, metric),
      prediction,
      projection: prediction ? projectionCurve(prediction, references, metric) : [],
    };
  };

  return {
    currentYear: selectedYear,
    todayKey,
    currentDay,
    series,
    missingYears,
    referenceYears: references.map((row) => row.year),
    anomalousYears: [...ANOMALOUS_YEARS],
    metrics: { runners: summarize("runners"), registrations: summarize("registrations") },
  };
}
