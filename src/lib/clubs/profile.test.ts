import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { RawResult } from "@/lib/stats/core";

import { createClubResolver, type ClubNameRow } from "./core";
import { computeClubProfile, resolveClubSlug } from "./profile";
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
  it("club = id: renamed club is one profile, other ids are separate", () => {
    const clubs = createClubResolver({ names: NAMES });
    const profile = computeClubProfile(RESULTS, clubs, "chc");
    assert.ok(profile);
    assert.equal(profile.id, "CHC");
    assert.equal(profile.name, "K.O.B. Choceň");
    assert.equal(profile.slug, "chc-k-o-b-chocen");
    assert.equal(profile.starts, 4);
    assert.deepEqual(profile.history, [
      { id: "CHC", name: "K.O.B. Choceň", firstYear: 2002, lastYear: 2003 },
      { id: "CHC", name: "KOB Choceň", firstYear: 2001, lastYear: 2001 },
    ]);
    assert.equal(computeClubProfile(RESULTS, clubs, "216")?.starts, 2);
  });

  it("after a merge (216 rewritten to CHC, Q45) the starts of both ids are one club", () => {
    // What the merge leaves in the data: 216's rows carry CHC, its 2003 cis_klub row collided
    // with CHC (dropped), its 2004 row moved to CHC with its own name.
    const names = [
      ...NAMES.filter((row) => row.id !== "216"),
      { id: "CHC", year: 2004, name: "KOB Choceń" },
    ];
    const results = RESULTS.map((row) => (row.clubId === "216" ? { ...row, clubId: "CHC" } : row));
    const clubs = createClubResolver({ names });
    const profile = computeClubProfile(results, clubs, "CHC");
    assert.ok(profile);
    assert.equal(profile.starts, 6);
    assert.equal(profile.runners, 2);
    assert.deepEqual(
      profile.perYear.map(({ year, starts }) => ({ year, starts })),
      [
        { year: 2001, starts: 1 },
        { year: 2002, starts: 2 },
        { year: 2003, starts: 2 },
        { year: 2004, starts: 1 },
      ],
    );
    // Fastest man and woman of the club in each edition.
    const y2003 = profile.perYear.find((row) => row.year === 2003);
    assert.equal(y2003?.best.M?.name, "Rychlý Petr");
    assert.equal(y2003?.best.M?.time, 870);
    assert.equal(y2003?.best.F?.name, "Svižná Eva");
    assert.equal(y2003?.best.F?.time, 1050);
    assert.equal(profile.perYear[0].best.F, undefined);
    // Club records = fastest of each sex ever.
    assert.equal(profile.best.M[0]?.time, 870);
    assert.equal(profile.best.F[0]?.year, 2004);
    assert.equal(profile.best.F[0]?.time, 1040);
    // History: names of CHC only (the merged id is gone).
    assert.deepEqual(
      profile.history.map((row) => [row.id, row.name, row.firstYear, row.lastYear]),
      [
        ["CHC", "KOB Choceń", 2004, 2004],
        ["CHC", "K.O.B. Choceň", 2002, 2003],
        ["CHC", "KOB Choceň", 2001, 2001],
      ],
    );
    assert.equal(computeClubProfile(results, clubs, "216"), null);
  });

  it("no profile for unknown ids and placeholders", () => {
    const clubs = createClubResolver({ names: NAMES });
    assert.equal(computeClubProfile(RESULTS, clubs, "ZZZ"), null);
    assert.equal(computeClubProfile(RESULTS, clubs, "000"), null);
  });
});

describe("club profile from the club's own rows", () => {
  it("equals the profile computed from all results (the page loads only the club's id)", () => {
    const clubs = createClubResolver({ names: NAMES });
    for (const id of ["CHC", "216", "ACH"]) {
      const own = RESULTS.filter((row) => row.clubId === id);
      assert.deepEqual(computeClubProfile(own, clubs, id), computeClubProfile(RESULTS, clubs, id));
    }
  });
});

describe("resolveClubSlug", () => {
  const clubs = createClubResolver({ names: NAMES });

  it("the id decides; a stale name part points to the id's slug", () => {
    assert.deepEqual(resolveClubSlug("chc-k-o-b-chocen", NAMES, clubs), {
      mainId: "CHC",
      canonical: "chc-k-o-b-chocen",
    });
    assert.equal(resolveClubSlug("chc-old-name", NAMES, clubs)?.canonical, "chc-k-o-b-chocen");
    assert.equal(resolveClubSlug("216-old", NAMES, clubs)?.canonical, "216-kob-chocen");
  });

  it("an old name-only slug means the id that used the name most recently", () => {
    assert.equal(resolveClubSlug("ac-chocen", NAMES, clubs)?.mainId, "ACH");
    assert.equal(resolveClubSlug("nobody-here", NAMES, clubs), null);
  });
});

describe("clubUsage", () => {
  it("one entry per id with names per edition, placeholders skipped", () => {
    const clubs = createClubResolver({ names: NAMES });
    const usage = clubUsage(RESULTS, NAMES, clubs);
    assert.deepEqual(
      usage.map((row) => [row.id, row.starts]),
      [
        ["CHC", 4],
        ["216", 2],
        ["ACH", 1],
      ],
    );
    const chc = usage[0];
    assert.deepEqual(chc.years, [2001, 2002, 2003]);
    assert.deepEqual(chc.names, [
      { name: "K.O.B. Choceň", years: [2002, 2003] },
      { name: "KOB Choceň", years: [2001] },
    ]);
  });
});

describe("club profile: top results and most starts (#197)", () => {
  it("top results are not unique per runner; best is one row per runner", () => {
    const clubs = createClubResolver({ names: NAMES });
    const profile = computeClubProfile(RESULTS, clubs, "CHC");
    assert.ok(profile);
    // Rychlý Petr ran for CHC three times: all three are among the top results.
    assert.deepEqual(
      profile.topResults.M.map((row) => [row.runnerId, row.year, row.time]),
      [
        ["19800001", 2003, 870],
        ["19800001", 2002, 880],
        ["19800001", 2001, 900],
      ],
    );
    assert.equal(profile.best.M.length, 1);
    assert.deepEqual(
      profile.topResults.F.map((row) => row.time),
      [1100],
    );
  });

  it("most starts lists the member(s) with the highest count, ties included", () => {
    const clubs = createClubResolver({ names: NAMES });
    const chc = computeClubProfile(RESULTS, clubs, "CHC");
    assert.equal(chc?.mostStarts?.starts, 3);
    assert.deepEqual(
      chc?.mostStarts?.runners.map((row) => [row.name, row.firstYear, row.lastYear]),
      [["Rychlý Petr", 2001, 2003]],
    );
    const tie = computeClubProfile(
      [
        ...RESULTS,
        r(2004, "19800001", 860, "Rychlý Petr", "216", "KOB Choceń"),
        r(2003, "19830001", 990, "Nový Tomáš", "216", "KOB Choceń"),
        r(2004, "19830001", 980, "Nový Tomáš", "216", "KOB Choceń"),
      ],
      clubs,
      "216",
    );
    assert.equal(tie?.mostStarts?.starts, 2);
    assert.deepEqual(
      tie?.mostStarts?.runners.map((row) => row.name),
      ["Nový Tomáš", "Svižná Eva"],
    );
  });
});
