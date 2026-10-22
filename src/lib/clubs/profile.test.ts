import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { RawResult } from "@/lib/stats/core";

import { createClubResolver, type ClubNameRow } from "./core";
import { computeClubProfile } from "./profile";
import { clubUsage } from "./usage";

// ids: YYYY + sex digit (0–4 men, 5–9 women) + sequence
const r = (
  year: number,
  runnerId: string,
  time: number,
  runnerName: string,
  clubId: string | null,
  clubName: string | null,
) => ({ year, runnerId, time, runnerName, clubId, clubName }) satisfies RawResult;

const NAMES: ClubNameRow[] = [
  { id: "CHC", year: 2001, name: "KOB Choceň" },
  { id: "CHC", year: 2002, name: "K.O.B. Choceň" },
  { id: "CHC", year: 2003, name: "K.O.B. Choceň" },
  { id: "216", year: 2003, name: "KOB Choceń" },
  { id: "216", year: 2004, name: "KOB Choceń" },
  { id: "ACH", year: 2003, name: "AC Choceň" },
  { id: "000", year: 2003, name: "" },
];

const RESULTS: RawResult[] = [
  r(2001, "19800001", 900, "Rychlý Petr", "CHC", "KOB Choceň"),
  r(2002, "19800001", 880, "Rychlý Petr", "CHC", "K.O.B. Choceň"),
  r(2002, "19855001", 1100, "Svižná Eva", "CHC", "K.O.B. Choceň"),
  r(2003, "19855001", 1050, "Svižná Eva", "216", "KOB Choceń"),
  r(2003, "19800001", 870, "Rychlý Petr", "CHC", "K.O.B. Choceň"),
  r(2004, "19855001", 1040, "Svižná Eva", "216", "KOB Choceń"),
  r(2003, "19810001", 950, "Druhý Jan", "ACH", "AC Choceň"),
  r(2003, "19820001", 990, "Třetí Karel", "000", ""),
];

describe("computeClubProfile", () => {
  it("club = id: renamed club is one profile, other ids are separate until merged", () => {
    const clubs = createClubResolver({ names: NAMES });
    const profile = computeClubProfile(RESULTS, clubs, "chc");
    assert.ok(profile);
    assert.equal(profile.id, "CHC");
    assert.equal(profile.name, "K.O.B. Choceň");
    assert.equal(profile.slug, "chc-k-o-b-chocen");
    assert.equal(profile.starts, 4);
    assert.deepEqual(profile.mergedIds, []);
    assert.deepEqual(profile.history, [
      { id: "CHC", name: "K.O.B. Choceň", firstYear: 2002, lastYear: 2003 },
      { id: "CHC", name: "KOB Choceň", firstYear: 2001, lastYear: 2001 },
    ]);
    assert.equal(computeClubProfile(RESULTS, clubs, "216")?.starts, 2);
  });

  it("merged ids: starts of both ids add up under the main id, even in one edition", () => {
    const clubs = createClubResolver({
      names: NAMES,
      merges: [{ clubId: "216", mainClubId: "CHC" }],
    });
    const profile = computeClubProfile(RESULTS, clubs, "CHC");
    assert.ok(profile);
    assert.equal(profile.starts, 6);
    assert.equal(profile.runners, 2);
    assert.deepEqual(profile.mergedIds, ["216"]);
    assert.deepEqual(profile.perYear, [
      { year: 2001, starts: 1 },
      { year: 2002, starts: 2 },
      { year: 2003, starts: 2 }, // CHC + 216 in the same edition
      { year: 2004, starts: 1 },
    ]);
    assert.equal(profile.best.F[0]?.time, 1040);
    assert.ok(profile.history.some((row) => row.id === "216" && row.name === "KOB Choceń"));
    // The merged id has no profile of its own (the page redirects to the main id).
    assert.equal(computeClubProfile(RESULTS, clubs, "216"), null);
  });

  it("no profile for unknown ids and placeholders", () => {
    const clubs = createClubResolver({ names: NAMES });
    assert.equal(computeClubProfile(RESULTS, clubs, "ZZZ"), null);
    assert.equal(computeClubProfile(RESULTS, clubs, "000"), null);
  });
});

describe("clubUsage", () => {
  it("one entry per main id with names per edition, placeholders skipped", () => {
    const clubs = createClubResolver({
      names: NAMES,
      merges: [{ clubId: "216", mainClubId: "CHC" }],
    });
    const usage = clubUsage(RESULTS, NAMES, clubs);
    assert.deepEqual(
      usage.map((row) => [row.id, row.starts]),
      [
        ["CHC", 6],
        ["ACH", 1],
      ],
    );
    const chc = usage[0];
    assert.deepEqual(chc.ids, ["CHC", "216"]);
    assert.deepEqual(chc.years, [2001, 2002, 2003, 2004]);
    assert.deepEqual(chc.names, [
      { name: "KOB Choceń", years: [2003, 2004] },
      { name: "K.O.B. Choceň", years: [2002, 2003] },
      { name: "KOB Choceň", years: [2001] },
    ]);
  });
});
