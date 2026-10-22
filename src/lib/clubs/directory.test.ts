import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createClubResolver, type ClubNameRow } from "./core";
import {
  computeClubDirectory,
  filterClubDirectory,
  isClubDirectorySort,
  sortClubDirectory,
  type ClubDirectoryInput,
} from "./directory";

const NAMES: ClubNameRow[] = [
  { id: "CHC", year: 2001, name: "KOB Choceň" },
  { id: "CHC", year: 2002, name: "K.O.B. Choceň" },
  // 216 "KOB Choceń" (2003) after a merge into CHC (Q45): the row moved to CHC.
  { id: "CHC", year: 2003, name: "KOB Choceń" },
  { id: "ACH", year: 2003, name: "AC Choceň" },
  { id: "ZLN", year: 2004, name: "Zlín" },
  { id: "000", year: 2003, name: "" },
];

const row = (year: number, runnerId: string, clubId: string, clubName: string) =>
  ({ year, runnerId, clubId, clubName }) satisfies ClubDirectoryInput;

const ROWS: ClubDirectoryInput[] = [
  row(2001, "19800001", "CHC", "KOB Choceň"),
  row(2002, "19800001", "CHC", "K.O.B. Choceň"),
  row(2002, "19855001", "CHC", "K.O.B. Choceň"),
  row(2003, "19855001", "CHC", "KOB Choceń"), // rewritten from 216 by the merge
  row(2003, "19810001", "ACH", "AC Choceň"),
  row(2004, "19810001", "ZLN", "Zlín"),
  row(2004, "19820001", "ZLN", "Zlín"),
  row(2003, "19830001", "000", ""),
];

describe("computeClubDirectory", () => {
  it("one row per club id, placeholders are skipped", () => {
    const clubs = createClubResolver({ names: NAMES });
    const list = computeClubDirectory(ROWS, clubs);
    assert.deepEqual(
      list.map((club) => [club.id, club.starts, club.runners, club.editions]),
      [
        ["CHC", 4, 2, 3],
        ["ZLN", 2, 2, 1],
        ["ACH", 1, 1, 1],
      ],
    );
    const chc = list[0];
    assert.equal(chc.name, "KOB Choceń");
    assert.equal(chc.slug, "chc-kob-chocen");
    assert.equal(chc.firstYear, 2001);
    assert.equal(chc.lastYear, 2003);
    assert.ok(!list.some((club) => club.id === "216" || club.id === "000"));
  });
});

describe("filterClubDirectory / sortClubDirectory", () => {
  const list = computeClubDirectory(ROWS, createClubResolver({ names: NAMES }));

  it("finds a club by its name, a former name or its id", () => {
    assert.deepEqual(
      filterClubDirectory(list, "chocen").map((club) => club.id),
      ["CHC", "ACH"],
    );
    assert.deepEqual(
      filterClubDirectory(list, "KOB Choceň").map((club) => club.id),
      ["CHC"],
    );
    assert.deepEqual(
      filterClubDirectory(list, "chc").map((club) => club.id),
      ["CHC"],
    );
    // A merged id no longer exists.
    assert.equal(filterClubDirectory(list, "216").length, 0);
    assert.deepEqual(
      filterClubDirectory(list, "zlin").map((club) => club.id),
      ["ZLN"],
    );
    assert.equal(filterClubDirectory(list, "").length, list.length);
    assert.equal(filterClubDirectory(list, "praha").length, 0);
  });

  it("sorts by starts, name, editions and last year", () => {
    assert.deepEqual(
      sortClubDirectory(list, "nazev").map((club) => club.id),
      ["ACH", "CHC", "ZLN"],
    );
    assert.deepEqual(
      sortClubDirectory(list, "rocniky").map((club) => club.id),
      ["CHC", "ZLN", "ACH"],
    );
    assert.deepEqual(
      sortClubDirectory(list, "posledni").map((club) => club.id),
      ["ZLN", "CHC", "ACH"],
    );
    assert.ok(isClubDirectorySort("starty"));
    assert.ok(!isClubDirectorySort("drop table"));
  });
});
