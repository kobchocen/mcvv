import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  buildYearSeries,
  chartRows,
  chartStartDay,
  dateBeforeRace,
  dayDiff,
  daysToRace,
  formatYearRanges,
  isCountedRegistration,
  median,
  pickReferenceYears,
  pragueDateKey,
  predictFinal,
  projectionCurve,
  sameDayComparison,
  valueAt,
  type TimelineEdition,
  type TimelineRegistration,
  type YearSeries,
} from "./registration-timeline";

function edition(year: number, raceDate: string, deadline: string | null = null): TimelineEdition {
  return { year, raceDate, deadline };
}

/** Přihláška `days` dní před závodem daného ročníku (čas 10:00 UTC). */
function reg(
  ed: TimelineEdition,
  days: number,
  runners = 1,
  status: number | null = 5,
): TimelineRegistration {
  const key = dateBeforeRace(ed.raceDate, days);
  return { year: ed.year, status, runners, created: new Date(`${key}T10:00:00Z`) };
}

/**
 * Syntetický ročník: konečný počet `total` běžců, podíl 25 % v D−30, 50 % v D−14, 80 % v D−7.
 */
function syntheticYear(year: number, raceDate: string, total: number): YearSeries {
  const ed = edition(year, raceDate, dateBeforeRace(raceDate, 4));
  const rows = [
    reg(ed, 40, total * 0.25),
    reg(ed, 20, total * 0.25),
    reg(ed, 10, total * 0.3),
    reg(ed, 5, total * 0.2),
  ];
  return buildYearSeries(ed, rows);
}

describe("dates", () => {
  it("counts days to race across month boundaries", () => {
    assert.equal(dayDiff("2026-10-22", "2026-12-06"), 45);
    assert.equal(dayDiff("2026-12-07", "2026-12-06"), -1);
    assert.equal(dateBeforeRace("2026-12-06", 45), "2026-10-22");
    assert.equal(daysToRace("2026-12-06", "2026-12-06"), 0);
  });

  it("uses the Prague calendar day for today", () => {
    // 22:30 UTC = 00:30 SELČ následujícího dne
    assert.equal(pragueDateKey(new Date("2026-10-21T22:30:00Z")), "2026-10-22");
    assert.equal(pragueDateKey(new Date("2026-12-05T23:30:00Z")), "2026-12-06");
  });
});

describe("isCountedRegistration", () => {
  it("counts statuses 2–5 with runners only", () => {
    for (const status of [2, 3, 4, 5]) assert.equal(isCountedRegistration(status, 1), true);
    for (const status of [0, 1, 9, null]) assert.equal(isCountedRegistration(status, 3), false);
    assert.equal(isCountedRegistration(5, 0), false);
  });
});

describe("buildYearSeries", () => {
  const ed = edition(2025, "2025-12-07", "2025-12-03");

  it("aligns by days to race and accumulates", () => {
    const series = buildYearSeries(ed, [reg(ed, 30, 2), reg(ed, 7, 3), reg(ed, 0, 1)]);
    assert.equal(series.deadlineDay, 4);
    assert.equal(valueAt(series, "runners", 31), 0);
    assert.equal(valueAt(series, "runners", 30), 2);
    assert.equal(valueAt(series, "runners", 8), 2);
    assert.equal(valueAt(series, "runners", 7), 5);
    assert.equal(valueAt(series, "runners", 0), 6);
    assert.equal(valueAt(series, "registrations", 0), 3);
    assert.equal(series.firstDay, 30);
    assert.equal(series.hasData, true);
  });

  it("skips cancelled, empty and unknown entries and other years", () => {
    const other = edition(2024, "2024-12-01");
    const series = buildYearSeries(ed, [
      reg(ed, 10, 4, 0),
      reg(ed, 10, 0, 2),
      reg(ed, 10, 2, 1),
      reg(ed, 10, 2, null),
      reg(other, 10, 5),
      reg(ed, 10, 2, 2),
    ]);
    assert.equal(valueAt(series, "runners", 0), 2);
    assert.equal(valueAt(series, "registrations", 0), 1);
  });

  it("drops entries after the race and without a creation date, and reports them", () => {
    const series = buildYearSeries(ed, [
      reg(ed, -3, 4),
      { year: 2025, status: 5, runners: 2, created: null },
      reg(ed, 1, 1),
    ]);
    assert.equal(valueAt(series, "runners", 0), 1);
    assert.equal(series.afterRace, 1);
    assert.equal(series.missingCreated, 1);
  });

  it("clamps very early entries into the horizon", () => {
    const series = buildYearSeries(ed, [reg(ed, 200, 1)], 120);
    assert.equal(series.firstDay, 200);
    assert.equal(valueAt(series, "runners", 120), 1);
    assert.equal(valueAt(series, "runners", 500), 1);
  });

  it("marks a year without dated entries as missing", () => {
    const series = buildYearSeries(ed, [{ year: 2025, status: 5, runners: 2, created: null }]);
    assert.equal(series.hasData, false);
    assert.equal(series.firstDay, null);
  });
});

describe("pickReferenceYears", () => {
  it("takes the last 5 completed years with data, without 2020", () => {
    const years = [2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026].map((year) =>
      syntheticYear(year, `${year}-12-05`, 100),
    );
    const empty = buildYearSeries(edition(2016, "2016-12-04"), []);
    const picked = pickReferenceYears([...years, empty], 2026).map((row) => row.year);
    assert.deepEqual(picked, [2025, 2024, 2023, 2022, 2021]);
    assert.deepEqual(
      pickReferenceYears(years, 2022).map((row) => row.year),
      [2021, 2019, 2018, 2017],
    );
  });
});

describe("predictFinal", () => {
  const refs = [
    syntheticYear(2025, "2025-12-07", 300),
    syntheticYear(2024, "2024-12-01", 320),
    syntheticYear(2023, "2023-12-03", 280),
  ];

  it("scales the current count by the median share of reference years", () => {
    const curEd = edition(2026, "2026-12-06", "2026-12-02");
    const current = buildYearSeries(curEd, [reg(curEd, 20, 150)]);
    const prediction = predictFinal(current, refs, 14, "runners");
    assert.ok(prediction);
    // podíl v D−14 je u všech ročníků 50 % → 150 / 0,5
    assert.equal(prediction.point, 300);
    assert.equal(prediction.min, 300);
    assert.equal(prediction.max, 300);
    assert.equal(prediction.medianShare, 0.5);
    assert.equal(prediction.reliable, true);
    assert.equal(prediction.references.length, 3);
  });

  it("gives a min–max range when reference shapes differ", () => {
    const early = buildYearSeries(edition(2022, "2022-12-04"), [
      reg(edition(2022, "2022-12-04"), 20, 80),
      reg(edition(2022, "2022-12-04"), 2, 20),
    ]);
    const curEd = edition(2026, "2026-12-06");
    const current = buildYearSeries(curEd, [reg(curEd, 14, 100)]);
    const prediction = predictFinal(current, [...refs, early], 14, "runners");
    assert.ok(prediction);
    assert.equal(prediction.min, 125); // 100 / 0,8
    assert.equal(prediction.max, 200); // 100 / 0,5
    assert.equal(prediction.point, 200); // medián [0,5; 0,5; 0,5; 0,8] → odhady [125, 200, 200, 200]
  });

  it("is null on race day, after the race, after the deadline and without entries", () => {
    const curEd = edition(2026, "2026-12-06", "2026-12-02");
    const current = buildYearSeries(curEd, [reg(curEd, 20, 50)]);
    assert.equal(predictFinal(current, refs, 0, "runners"), null);
    assert.equal(predictFinal(current, refs, -2, "runners"), null);
    assert.equal(predictFinal(current, refs, 3, "runners"), null);
    assert.ok(predictFinal(current, refs, 4, "runners"));
    const none = buildYearSeries(curEd, []);
    assert.equal(predictFinal(none, refs, 30, "runners"), null);
    assert.equal(predictFinal(current, [], 14, "runners"), null);
  });

  it("handles the first day of entries (references without entries yet are skipped)", () => {
    const curEd = edition(2026, "2026-12-06");
    const current = buildYearSeries(curEd, [reg(curEd, 60, 25)]);
    // ve D−60 nemá žádný srovnávací ročník přihlášky → nelze odhadnout
    assert.equal(predictFinal(current, refs, 60, "runners"), null);
    const prediction = predictFinal(current, refs, 40, "runners");
    assert.ok(prediction);
    assert.equal(prediction.point, 100); // 25 / 0,25
  });

  it("flags rough projections (low share or few entries)", () => {
    const curEd = edition(2026, "2026-12-06");
    const current = buildYearSeries(curEd, [reg(curEd, 40, 10)]);
    const prediction = predictFinal(current, refs, 40, "runners");
    assert.ok(prediction);
    assert.equal(prediction.reliable, false);
  });

  it("works for the registrations metric", () => {
    const curEd = edition(2026, "2026-12-06");
    const current = buildYearSeries(curEd, [reg(curEd, 20, 3)]);
    const prediction = predictFinal(current, refs, 14, "registrations");
    assert.ok(prediction);
    // srovnávací ročníky mají 4 přihlášky, 2 z nich do D−14 → 1 / 0,5
    assert.equal(prediction.point, 2);
  });
});

describe("projectionCurve", () => {
  it("starts at today's value and ends at the projection", () => {
    const refs = [syntheticYear(2025, "2025-12-07", 300), syntheticYear(2024, "2024-12-01", 400)];
    const curEd = edition(2026, "2026-12-06");
    const current = buildYearSeries(curEd, [reg(curEd, 20, 150)]);
    const prediction = predictFinal(current, refs, 14, "runners")!;
    const curve = projectionCurve(prediction, refs, "runners");
    assert.equal(curve[0].day, 14);
    assert.equal(curve[0].point, 150);
    assert.equal(curve.at(-1)!.day, 0);
    assert.equal(curve.at(-1)!.point, prediction.point);
    for (let i = 1; i < curve.length; i += 1) {
      assert.ok(curve[i].point >= curve[i - 1].point);
      assert.ok(curve[i].min <= curve[i].point && curve[i].point <= curve[i].max);
    }
  });
});

describe("sameDayComparison", () => {
  it("compares with last year and the reference average", () => {
    const y25 = syntheticYear(2025, "2025-12-07", 200);
    const y24 = syntheticYear(2024, "2024-12-01", 400);
    const curEd = edition(2026, "2026-12-06");
    const current = buildYearSeries(curEd, [reg(curEd, 20, 60)]);
    const result = sameDayComparison(current, [y24, y25, current], [y25, y24], 14, "runners");
    assert.equal(result.current, 60);
    assert.deepEqual(result.lastYear, { year: 2025, value: 100, diffPct: -40 });
    assert.equal(result.average, 150);
  });

  it("has no last-year diff when last year had nobody yet", () => {
    const y25 = buildYearSeries(edition(2025, "2025-12-07"), []);
    const curEd = edition(2026, "2026-12-06");
    const current = buildYearSeries(curEd, [reg(curEd, 50, 5)]);
    const result = sameDayComparison(current, [y25], [], 45, "runners");
    assert.equal(result.lastYear, null);
    assert.equal(result.average, null);
  });
});

describe("chart helpers", () => {
  it("cuts the current year at today and appends the projection", () => {
    const y25 = syntheticYear(2025, "2025-12-07", 100);
    const curEd = edition(2026, "2026-12-06");
    const current = buildYearSeries(curEd, [reg(curEd, 20, 30)]);
    const rows = chartRows([y25, current], "runners", 30, { year: 2026, day: 14 }, [
      { day: 14, point: 30, min: 30, max: 30 },
      { day: 0, point: 60, min: 50, max: 70 },
    ]);
    assert.equal(rows.length, 31);
    assert.equal(rows[0].day, -30);
    assert.equal(rows.at(-1)!.day, 0);
    const today = rows.find((row) => row.day === -14)!;
    assert.equal(today.y2026, 30);
    assert.equal(today.forecast, 30);
    const raceDay = rows.at(-1)!;
    assert.equal(raceDay.y2026, null);
    assert.equal(raceDay.y2025, 100);
    assert.deepEqual(raceDay.forecastRange, [50, 70]);
  });

  it("starts the axis at the earliest first entry, rounded to 10", () => {
    const y = buildYearSeries(edition(2025, "2025-12-07"), [
      reg(edition(2025, "2025-12-07"), 58, 1),
    ]);
    assert.equal(chartStartDay([y]), 60);
    assert.equal(chartStartDay([]), 30);
  });

  it("formats missing year ranges", () => {
    assert.equal(formatYearRanges([2003, 2001, 2002, 2005]), "2001–2003, 2005");
    assert.equal(formatYearRanges([]), "");
    assert.equal(median([3, 1, 2, 10]), 2.5);
  });
});
