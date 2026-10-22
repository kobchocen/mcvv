import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { RawResult } from "@/lib/stats/core";

import { createClubResolver } from "./core";
import { computeClubProfile, nameTarget } from "./profile";
import { clubNameUsage } from "./usage";

// ids: YYYY + sex digit (0–4 men, 5–9 women) + sequence
const r = (
  year: number,
  runnerId: string,
  time: number,
  runnerName: string,
  clubName: string | null,
) => ({ year, runnerId, time, runnerName, clubName }) satisfies RawResult;

const RESULTS: RawResult[] = [
  r(2001, "19800001", 900, "Rychlý Petr", "K.O.B. Choceň"),
  r(2002, "19800001", 880, "Rychlý Petr", "KOB Choceň"),
  r(2002, "19855001", 1100, "Svižná Eva", "K.O.B. Choceň"),
  r(2003, "19855001", 1050, "Svižná Eva", "KOB Choceň z.s."),
  r(2003, "19810001", 950, "Druhý Jan", "AC Choceň"),
  r(2003, "19820001", 990, "Třetí Karel", null),
];

describe("computeClubProfile", () => {
  it("written name: only that name (case/diacritics/punctuation ignored), nothing merged", () => {
    const profile = computeClubProfile(
      RESULTS,
      createClubResolver(),
      nameTarget("kob-chocen"),
      "kob-chocen",
    );
    assert.ok(profile);
    assert.equal(profile.canonical, false);
    assert.equal(profile.starts, 3);
    assert.equal(profile.name, "K.O.B. Choceň");
    assert.deepEqual(profile.perYear, [
      { year: 2001, starts: 1 },
      { year: 2002, starts: 2 },
    ]);
    assert.deepEqual(
      profile.variants.map((v) => v.name),
      ["K.O.B. Choceň", "KOB Choceň"],
    );
  });

  it("canonical club: all confirmed aliases, starts per year, members and best per sex", () => {
    const club = { id: 1, slug: "kob-chocen", name: "KOB Choceň" };
    const resolver = createClubResolver([
      { key: "kobchocen", club },
      { key: "kobchocenzs", club },
    ]);
    const profile = computeClubProfile(
      RESULTS,
      resolver,
      { kind: "canonical", ...club },
      "kob-chocen",
    );
    assert.ok(profile);
    assert.equal(profile.name, "KOB Choceň");
    assert.equal(profile.starts, 4);
    assert.equal(profile.runners, 2);
    assert.equal(profile.firstYear, 2001);
    assert.equal(profile.lastYear, 2003);
    assert.deepEqual(
      profile.members.map((m) => [m.name, m.starts, m.best]),
      [
        ["Svižná Eva", 2, 1050],
        ["Rychlý Petr", 2, 880],
      ],
    );
    assert.deepEqual(profile.best.M, [
      { runnerId: "19800001", name: "Rychlý Petr", year: 2002, time: 880 },
    ]);
    assert.deepEqual(profile.best.F, [
      { runnerId: "19855001", name: "Svižná Eva", year: 2003, time: 1050 },
    ]);
    // A written name that is now an alias no longer has its own profile.
    assert.equal(
      computeClubProfile(RESULTS, resolver, nameTarget("kob-chocen"), "kob-chocen"),
      null,
    );
  });

  it("unknown club → null", () => {
    assert.equal(computeClubProfile(RESULTS, createClubResolver(), nameTarget("nic"), "nic"), null);
  });
});

describe("clubNameUsage", () => {
  it("counts starts per written name with spellings and canonical club", () => {
    const resolver = createClubResolver([
      { key: "acchocen", club: { id: 9, slug: "ac-chocen", name: "AC Choceň" } },
    ]);
    const rows = clubNameUsage(RESULTS, resolver);
    assert.deepEqual(
      rows.map((row) => [row.name, row.starts, row.firstYear, row.lastYear, row.canonicalId]),
      [
        ["K.O.B. Choceň", 3, 2001, 2002, null],
        ["AC Choceň", 1, 2003, 2003, 9],
        ["KOB Choceň z.s.", 1, 2003, 2003, null],
      ],
    );
    assert.equal(rows[0].spellings.length, 2);
  });
});
