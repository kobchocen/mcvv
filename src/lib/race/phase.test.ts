import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { heroButtons, raceStartFor, resolveHeroPhase } from "./phase";

const race2026 = raceStartFor(new Date(Date.UTC(2026, 11, 6)), 2026);

describe("raceStartFor", () => {
  it("is 10:15 Europe/Prague on the edition date (CET = UTC+1 in December)", () => {
    assert.equal(race2026.toISOString(), "2026-12-06T09:15:00.000Z");
  });

  it("falls back to the first Sunday of December without an edition date", () => {
    assert.equal(raceStartFor(null, 2026).toISOString(), "2026-12-06T09:15:00.000Z");
    assert.equal(raceStartFor(undefined, 2027).toISOString(), "2027-12-05T09:15:00.000Z");
  });

  it("respects daylight saving time (CEST = UTC+2) and the DST switch days", () => {
    assert.equal(
      raceStartFor(new Date(Date.UTC(2026, 5, 7)), 2026).toISOString(),
      "2026-06-07T08:15:00.000Z",
    );
    // 29 Mar 2026: clocks jump 02:00 -> 03:00, 10:15 is already CEST.
    assert.equal(
      raceStartFor(new Date(Date.UTC(2026, 2, 29)), 2026).toISOString(),
      "2026-03-29T08:15:00.000Z",
    );
    // 25 Oct 2026: clocks go back 03:00 -> 02:00, 10:15 is already CET.
    assert.equal(
      raceStartFor(new Date(Date.UTC(2026, 9, 25)), 2026).toISOString(),
      "2026-10-25T09:15:00.000Z",
    );
  });
});

describe("resolveHeroPhase", () => {
  const base = { raceStart: race2026, startlistPublished: false, resultsCount: 0 };

  it("A before the start list is published", () => {
    assert.equal(resolveHeroPhase({ ...base, now: new Date("2026-10-20T12:00:00Z") }), "A");
  });

  it("B once the start list is published and the race has not started", () => {
    assert.equal(
      resolveHeroPhase({
        ...base,
        startlistPublished: true,
        now: new Date("2026-12-05T20:00:00Z"),
      }),
      "B",
    );
  });

  it("switches to C exactly at 10:15:00 Prague time (10:14:59 is still before)", () => {
    const at = (iso: string, startlistPublished: boolean) =>
      resolveHeroPhase({ ...base, startlistPublished, now: new Date(iso) });
    // 10:14:59 Prague = 09:14:59Z
    assert.equal(at("2026-12-06T09:14:59.000Z", true), "B");
    assert.equal(at("2026-12-06T09:14:59.999Z", false), "A");
    // 10:15:00 Prague = 09:15:00Z
    assert.equal(at("2026-12-06T09:15:00.000Z", true), "C");
    assert.equal(at("2026-12-06T09:15:00.000Z", false), "C");
  });

  it("C lasts until results exist (days after the race too)", () => {
    assert.equal(resolveHeroPhase({ ...base, now: new Date("2026-12-20T12:00:00Z") }), "C");
  });

  it("D as soon as results exist, regardless of time or start list", () => {
    for (const now of ["2026-10-01T00:00:00Z", "2026-12-06T09:20:00Z"]) {
      assert.equal(
        resolveHeroPhase({
          ...base,
          startlistPublished: true,
          resultsCount: 1,
          now: new Date(now),
        }),
        "D",
      );
    }
  });

  it("DST boundary: summer edition switches at 08:15Z", () => {
    const raceStart = raceStartFor(new Date(Date.UTC(2026, 5, 7)), 2026);
    const at = (iso: string) => resolveHeroPhase({ ...base, raceStart, now: new Date(iso) });
    assert.equal(at("2026-06-07T08:14:59Z"), "A");
    assert.equal(at("2026-06-07T08:15:00Z"), "C");
  });
});

describe("heroButtons", () => {
  const counts = { entriesCount: 120, startlistCount: 250, resultsCount: 266 };

  it("A: Přihlášky (count) + Rozpis with countdown", () => {
    const b = heroButtons({ phase: "A", onlineResultsUrl: null, ...counts });
    assert.deepEqual(b.primary, { kind: "entries", href: "/prihlaseni-zavodnici", count: 120 });
    assert.deepEqual(b.secondary, { kind: "program", href: "/program" });
    assert.equal(b.showCountdown, true);
  });

  it("B: Startovka (count) + Pokyny, no countdown", () => {
    const b = heroButtons({ phase: "B", onlineResultsUrl: "https://x.cz", ...counts });
    assert.deepEqual(b.primary, { kind: "startlist", href: "/startovka", count: 250 });
    assert.deepEqual(b.secondary, { kind: "instructions", href: "/pokyny" });
    assert.equal(b.showCountdown, false);
  });

  it("C: external online results link when the URL is set, else /vysledky", () => {
    const withUrl = heroButtons({
      phase: "C",
      onlineResultsUrl: "https://live.example/mcvv",
      ...counts,
    });
    assert.deepEqual(withUrl.primary, {
      kind: "onlineResults",
      href: "https://live.example/mcvv",
      external: true,
    });
    assert.deepEqual(withUrl.secondary, { kind: "instructions", href: "/pokyny" });
    const without = heroButtons({ phase: "C", onlineResultsUrl: null, ...counts });
    assert.deepEqual(without.primary, { kind: "results", href: "/vysledky" });
    assert.equal(without.showCountdown, false);
  });

  it("D: single Výsledky (count) button", () => {
    const b = heroButtons({ phase: "D", onlineResultsUrl: "https://x.cz", ...counts });
    assert.deepEqual(b.primary, { kind: "results", href: "/vysledky", count: 266 });
    assert.equal(b.secondary, null);
    assert.equal(b.showCountdown, false);
  });
});
