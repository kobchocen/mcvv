import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import type { TeamFinisher } from "./scoring";
import {
  MIN_FINISHERS,
  categoryPlaces,
  comparePlaceSeries,
  computeTeamCompetition,
  finishersFromTimedResults,
  officialPodium,
  pointsForPlace,
  teamKey,
  winnersOf,
} from "./scoring";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "fixtures");

function loadFixture(year: number): TeamFinisher[] {
  const raw = JSON.parse(readFileSync(join(fixtures, `${year}.json`), "utf8")) as TeamFinisher[];
  return raw.map((row) => ({
    ...row,
    clubId: row.clubId ?? row.clubName ?? null,
  }));
}

function officialNames(year: number) {
  return computeTeamCompetition(loadFixture(year)).official.map((row) => ({
    rank: row.rank,
    team: row.team,
    points: row.points,
    finishers: row.finishers,
  }));
}

test("points: men/women use the 1–10 scale, other categories the 1–5 scale", () => {
  assert.equal(pointsForPlace("A", 1), 20);
  assert.equal(pointsForPlace("F", 10), 1);
  assert.equal(pointsForPlace("a", 2), 16);
  assert.equal(pointsForPlace("B", 1), 10);
  assert.equal(pointsForPlace("J", 5), 2);
  assert.equal(pointsForPlace("A", 11), 0);
  assert.equal(pointsForPlace("B", 6), 0);
  assert.equal(pointsForPlace("A", 0), 0);
});

test("categoryPlaces shares a rank on equal times and skips the next place", () => {
  const places = categoryPlaces([
    { categoryId: "A", time: 100 },
    { categoryId: "A", time: 110 },
    { categoryId: "A", time: 110 },
    { categoryId: "A", time: 120 },
    { categoryId: "F", time: 90 },
  ]);
  assert.deepEqual(places, [1, 2, 2, 4, 1]);
});

test("teamKey is the club id and rejects empty / placeholder ids", () => {
  assert.equal(teamKey("lpu"), "LPU");
  assert.equal(teamKey("LPU"), "LPU");
  assert.equal(teamKey(" lpu "), "LPU");
  assert.notEqual(teamKey("LPU"), teamKey("CHC"));
  assert.equal(teamKey(""), null);
  assert.equal(teamKey("   "), null);
  assert.equal(teamKey(null), null);
  assert.equal(teamKey(undefined), null);
  assert.equal(teamKey("000"), null);
  assert.equal(teamKey("000 "), null);
});

test("at most one scorer per team per category, the one with the most points", () => {
  const { official, unclassified } = computeTeamCompetition([
    {
      categoryId: "A",
      categoryName: "muži",
      place: 1,
      runnerName: "První",
      clubId: "AC Test",
      clubName: "AC Test",
    },
    {
      categoryId: "A",
      categoryName: "muži",
      place: 2,
      runnerName: "Druhý",
      clubId: "AC Test",
      clubName: "AC Test",
    },
    {
      categoryId: "J",
      categoryName: "žáci",
      place: 1,
      runnerName: "Žák",
      clubId: "AC Test",
      clubName: "AC Test",
    },
    {
      categoryId: "F",
      categoryName: "ženy",
      place: 5,
      runnerName: "Žena",
      clubId: "AC Test",
      clubName: "AC Test",
    },
  ]);
  assert.equal(unclassified.length, 0);
  assert.equal(official.length, 1);
  assert.equal(official[0]!.points, 20 + 10 + 6);
  assert.deepEqual(
    official[0]!.counted.map((row) => `${row.runnerName}:${row.points}`),
    ["První:20", "Žák:10", "Žena:6"],
  );
});

test("a team with fewer than three classified finishers is not ranked, even with high points", () => {
  const { official, unclassified } = computeTeamCompetition([
    {
      categoryId: "A",
      categoryName: "muži",
      place: 1,
      runnerName: "A",
      clubId: "Malý",
      clubName: "Malý",
    },
    {
      categoryId: "F",
      categoryName: "ženy",
      place: 1,
      runnerName: "B",
      clubId: "Malý",
      clubName: "Malý",
    },
    {
      categoryId: "A",
      categoryName: "muži",
      place: 2,
      runnerName: "C",
      clubId: "Velký",
      clubName: "Velký",
    },
    {
      categoryId: "F",
      categoryName: "ženy",
      place: 2,
      runnerName: "D",
      clubId: "Velký",
      clubName: "Velký",
    },
    {
      categoryId: "J",
      categoryName: "žáci",
      place: 1,
      runnerName: "E",
      clubId: "Velký",
      clubName: "Velký",
    },
  ]);
  assert.equal(MIN_FINISHERS, 3);
  assert.equal(official.length, 1);
  assert.equal(official[0]!.team, "Velký");
  assert.equal(official[0]!.points, 16 + 16 + 10);
  assert.equal(unclassified.length, 1);
  assert.equal(unclassified[0]!.team, "Malý");
  assert.equal(unclassified[0]!.points, 40);
  assert.equal(unclassified[0]!.rank, null);
  assert.equal(unclassified[0]!.classified, false);
});

test("runners without a club id are not a team, even when a name is written", () => {
  const { official, unclassified } = computeTeamCompetition([
    { categoryId: "A", place: 1, runnerName: "A", clubId: null, clubName: "Alfa" },
    { categoryId: "A", place: 2, runnerName: "B", clubId: "", clubName: "Alfa" },
    { categoryId: "A", place: 3, runnerName: "C", clubId: "000", clubName: "Alfa" },
    { categoryId: "F", place: 1, runnerName: "D", clubId: "XXX", clubName: "neregistrovaný" },
    { categoryId: "A", place: 4, runnerName: "E", clubId: "KLB", clubName: "Klub" },
    { categoryId: "F", place: 2, runnerName: "F", clubId: "KLB", clubName: "Klub" },
    { categoryId: "J", place: 1, runnerName: "G", clubId: "KLB", clubName: "Klub" },
  ]);
  assert.equal(official.length, 1);
  assert.equal(official[0]!.clubId, "KLB");
  assert.equal(official[0]!.team, "Klub");
  assert.equal(official[0]!.finishers, 3);
  assert.equal(unclassified.length, 0);
});

test("the same club id is one team even when the written names differ", () => {
  const { official } = computeTeamCompetition([
    {
      categoryId: "A",
      place: 1,
      runnerName: "A1",
      clubId: "LPU",
      clubName: "OK LOKOMOTIVA PARDUBICE",
    },
    {
      categoryId: "F",
      place: 2,
      runnerName: "A2",
      clubId: "LPU",
      clubName: "OK Lokomotiva Pardubice",
    },
    {
      categoryId: "J",
      place: 3,
      runnerName: "A3",
      clubId: "LPU",
      clubName: "Lokomotiva Pardubice",
    },
  ]);
  assert.equal(official.length, 1);
  assert.equal(official[0]!.clubId, "LPU");
  assert.equal(official[0]!.team, "OK LOKOMOTIVA PARDUBICE");
  assert.equal(official[0]!.finishers, 3);
});

test("two club ids stay two teams even when the display name is the same", () => {
  const { official } = computeTeamCompetition([
    {
      categoryId: "A",
      place: 1,
      runnerName: "A1",
      clubId: "NM1",
      clubName: "TJ Nové Město na Moravě",
    },
    {
      categoryId: "F",
      place: 2,
      runnerName: "A2",
      clubId: "NM1",
      clubName: "TJ Nové Město na Moravě",
    },
    {
      categoryId: "J",
      place: 3,
      runnerName: "A3",
      clubId: "NM1",
      clubName: "TJ Nové Město na Moravě",
    },
    {
      categoryId: "A",
      place: 2,
      runnerName: "B1",
      clubId: "NM2",
      clubName: "TJ Nové Město na Moravě",
    },
    {
      categoryId: "F",
      place: 3,
      runnerName: "B2",
      clubId: "NM2",
      clubName: "TJ Nové Město na Moravě",
    },
    {
      categoryId: "J",
      place: 4,
      runnerName: "B3",
      clubId: "NM2",
      clubName: "TJ Nové Město na Moravě",
    },
  ]);
  assert.equal(official.length, 2);
  assert.equal(official[0]!.clubId, "NM1");
  assert.equal(official[1]!.clubId, "NM2");
  assert.equal(official[0]!.team, official[1]!.team);
  assert.notEqual(official[0]!.points, official[1]!.points);
});

test("identical points and place series share a rank and skip the next place", () => {
  const { official } = computeTeamCompetition([
    { categoryId: "B", place: 1, runnerName: "A1", clubId: "Alfa", clubName: "Alfa" },
    { categoryId: "C", place: 3, runnerName: "A2", clubId: "Alfa", clubName: "Alfa" },
    { categoryId: "J", place: 5, runnerName: "A3", clubId: "Alfa", clubName: "Alfa" },
    { categoryId: "G", place: 1, runnerName: "B1", clubId: "Beta", clubName: "Beta" },
    { categoryId: "H", place: 3, runnerName: "B2", clubId: "Beta", clubName: "Beta" },
    { categoryId: "K", place: 5, runnerName: "B3", clubId: "Beta", clubName: "Beta" },
    { categoryId: "A", place: 10, runnerName: "G1", clubId: "Gama", clubName: "Gama" },
    { categoryId: "F", place: 10, runnerName: "G2", clubId: "Gama", clubName: "Gama" },
    { categoryId: "L", place: 5, runnerName: "G3", clubId: "Gama", clubName: "Gama" },
  ]);
  // Alfa and Beta: 10+6+2 = 18, series 1,3,5. Gama: 1+1+2 = 4.
  assert.equal(official[0]!.rank, 1);
  assert.equal(official[1]!.rank, 1);
  assert.equal(official[2]!.rank, 3);
  assert.equal(official[2]!.team, "Gama");
  assert.deepEqual(
    official
      .filter((row) => row.rank === 1)
      .map((row) => row.team)
      .sort(),
    ["Alfa", "Beta"],
  );
  const podium = officialPodium({ official, unclassified: [] }, 1);
  assert.equal(podium.length, 2);
});

test("tie-break uses more 1sts among counted results, then more 2nds (PRAVIDLA.md)", () => {
  assert.ok(comparePlaceSeries([2, 0], [1, 2]) < 0); // two 1sts beat one 1st + two 2nds
  // Both 22 points: Alfa has two firsts in other categories, Beta has the men's win.
  // Official rules count all first places, so Alfa ranks first (HISTORIE.md would prefer Beta).
  const { official } = computeTeamCompetition([
    { categoryId: "J", place: 1, runnerName: "A1", clubId: "Alfa", clubName: "Alfa" },
    { categoryId: "K", place: 1, runnerName: "A2", clubId: "Alfa", clubName: "Alfa" },
    { categoryId: "B", place: 5, runnerName: "A3", clubId: "Alfa", clubName: "Alfa" },
    { categoryId: "A", place: 1, runnerName: "B1", clubId: "Beta", clubName: "Beta" },
    { categoryId: "C", place: 5, runnerName: "B2", clubId: "Beta", clubName: "Beta" },
    { categoryId: "L", place: 6, runnerName: "B3", clubId: "Beta", clubName: "Beta" },
  ]);
  assert.equal(official[0]!.points, 22);
  assert.equal(official[1]!.points, 22);
  assert.equal(official[0]!.team, "Alfa");
  assert.equal(official[1]!.team, "Beta");
});

test("2025 official list: K.O.B. Choceň 42 ahead of Lokomotiva 38 when teams are keyed by club id", () => {
  const { official, unclassified } = computeTeamCompetition(loadFixture(2025));
  const top = official.slice(0, 5).map((row) => [row.rank, row.team, row.points, row.finishers]);
  assert.deepEqual(top, [
    [1, "K.O.B. Choceň", 42, 29],
    [2, "OK Lokomotiva Pardubice", 38, 35],
    [3, "OK 99 Hradec Králové", 26, 4],
    [4, "NMMOR", 22, 4],
    [5, "TJ Spartak první brněnská", 20, 6],
  ]);
  assert.equal(official[0]!.clubId, "CHC");
  const mizuno = unclassified.find((row) => row.team === "MIZUNO TEAM");
  assert.ok(mizuno);
  assert.equal(mizuno!.finishers, 1);
  assert.equal(mizuno!.points, 20);
  assert.equal(
    official.find((row) => row.team === "MIZUNO TEAM"),
    undefined,
  );
  // Counted performances for the tied leaders.
  const nmnm = official[0]!;
  assert.deepEqual(
    nmnm.counted.map(
      (row) => `${row.place}. ${row.categoryName} ${row.runnerName} (${row.points})`,
    ),
    [
      "1. ženy nad 40 let Nimshausová Hana (10)",
      "2. dorostenky Nimshausová Helena (8)",
      "3. muži nad 60 let Půlpán Roman (6)",
      "3. ženy Mimrová Kateřina (12)",
      "5. muži nad 40 let Pešek Ondřej (2)",
      "5. muži nad 50 let Švadlena Pavel (2)",
      "9. muži Švadlena Michal (2)",
    ],
  );
});

test("2021 official list: Lokomotiva 50 ahead of K.O.B. 36 when teams are keyed by club id", () => {
  const top = officialNames(2021).slice(0, 5);
  assert.deepEqual(top, [
    { rank: 1, team: "OK LOKOMOTIVA PARDUBICE", points: 50, finishers: 38 },
    { rank: 2, team: "K.O.B. Choceň", points: 36, finishers: 39 },
    { rank: 3, team: "PHK", points: 30, finishers: 3 },
    { rank: 4, team: "AK ISCAREX Česká Třebová", points: 30, finishers: 4 },
    { rank: 5, team: "OK Jihlava", points: 28, finishers: 11 },
  ]);
});

test("1999 remiza under PRAVIDLA.md: Lokomotiva 46 ahead of Ok99 46 (two firsts vs one)", () => {
  const { official } = computeTeamCompetition(loadFixture(1999));
  assert.equal(official[0]!.team, "Lokomotiva Pardubice");
  assert.equal(official[0]!.clubId, "LPU");
  assert.equal(official[0]!.points, 46);
  assert.equal(official[0]!.finishers, 33);
  assert.equal(official[1]!.team, "Ok99 Hradec Králové");
  assert.equal(official[1]!.points, 46);
  assert.equal(official[1]!.finishers, 10);
  // HISTORIE.md would have put Ok99 first (men's win). Official rules count all first places.
  const lokoFirsts = official[0]!.counted.filter((row) => row.place === 1).length;
  const ok99Firsts = official[1]!.counted.filter((row) => row.place === 1).length;
  assert.equal(lokoFirsts, 2);
  assert.equal(ok99Firsts, 1);
  const winner = winnersOf({ official, unclassified: [] }, 1999);
  assert.deepEqual(winner, [
    { year: 1999, rank: 1, team: "Lokomotiva Pardubice", points: 46, finishers: 33, tied: false },
  ]);
});

test("finishersFromTimedResults assigns competition places before scoring", () => {
  const finishers = finishersFromTimedResults([
    {
      categoryId: "A",
      categoryName: "muži",
      time: 900,
      runnerName: "A",
      clubId: "Tým",
      clubName: "Tým",
    },
    {
      categoryId: "A",
      categoryName: "muži",
      time: 910,
      runnerName: "B",
      clubId: "Tým",
      clubName: "Tým",
    },
    {
      categoryId: "F",
      categoryName: "ženy",
      time: 1000,
      runnerName: "C",
      clubId: "Tým",
      clubName: "Tým",
    },
  ]);
  assert.deepEqual(
    finishers.map((row) => `${row.runnerName}:${row.place}`),
    ["A:1", "B:2", "C:1"],
  );
  const { official } = computeTeamCompetition(finishers);
  assert.equal(official[0]!.points, 20 + 20);
});
