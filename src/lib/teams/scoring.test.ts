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
  return raw;
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

test("teamKey trims only and rejects empty / placeholder clubs", () => {
  assert.equal(teamKey(" OK 99 "), "OK 99");
  assert.equal(teamKey("OK 99"), "OK 99");
  assert.notEqual(teamKey("OK 99"), teamKey("OK99"));
  assert.equal(teamKey(""), null);
  assert.equal(teamKey("   "), null);
  assert.equal(teamKey("—"), null);
  assert.equal(teamKey("-"), null);
  assert.equal(teamKey("neregistrovaný"), null);
  assert.equal(teamKey("bez klubu"), null);
  assert.notEqual(teamKey("OK LOKOMOTIVA PARDUBICE"), teamKey("OK Lokomotiva Pardubice"));
});

test("at most one scorer per team per category, the one with the most points", () => {
  const { official, unclassified } = computeTeamCompetition([
    { categoryId: "A", categoryName: "muži", place: 1, runnerName: "První", clubName: "AC Test" },
    { categoryId: "A", categoryName: "muži", place: 2, runnerName: "Druhý", clubName: "AC Test" },
    { categoryId: "J", categoryName: "žáci", place: 1, runnerName: "Žák", clubName: "AC Test" },
    { categoryId: "F", categoryName: "ženy", place: 5, runnerName: "Žena", clubName: "AC Test" },
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
    { categoryId: "A", categoryName: "muži", place: 1, runnerName: "A", clubName: "Malý" },
    { categoryId: "F", categoryName: "ženy", place: 1, runnerName: "B", clubName: "Malý" },
    { categoryId: "A", categoryName: "muži", place: 2, runnerName: "C", clubName: "Velký" },
    { categoryId: "F", categoryName: "ženy", place: 2, runnerName: "D", clubName: "Velký" },
    { categoryId: "J", categoryName: "žáci", place: 1, runnerName: "E", clubName: "Velký" },
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

test("runners without a club are not a team and are not grouped together", () => {
  const { official, unclassified } = computeTeamCompetition([
    { categoryId: "A", place: 1, runnerName: "A", clubName: "—" },
    { categoryId: "A", place: 2, runnerName: "B", clubName: "" },
    { categoryId: "A", place: 3, runnerName: "C", clubName: "neregistrovaný" },
    { categoryId: "F", place: 1, runnerName: "D", clubName: "  " },
    { categoryId: "A", place: 4, runnerName: "E", clubName: "Klub" },
    { categoryId: "F", place: 2, runnerName: "F", clubName: "Klub" },
    { categoryId: "J", place: 1, runnerName: "G", clubName: "Klub" },
  ]);
  assert.equal(official.length, 1);
  assert.equal(official[0]!.team, "Klub");
  assert.equal(official[0]!.finishers, 3);
  assert.equal(unclassified.length, 0);
});

test("OK 99 and OK99 stay two different teams", () => {
  const finishers: TeamFinisher[] = [];
  for (const team of ["OK 99", "OK99"]) {
    finishers.push(
      { categoryId: "A", place: 1, runnerName: `${team}-A`, clubName: team },
      { categoryId: "F", place: 2, runnerName: `${team}-F`, clubName: team },
      { categoryId: "J", place: 3, runnerName: `${team}-J`, clubName: team },
    );
  }
  // Give OK 99 the men's win so the two teams are not a tie.
  finishers[3] = { categoryId: "A", place: 2, runnerName: "OK99-A", clubName: "OK99" };
  const { official } = computeTeamCompetition(finishers);
  assert.equal(official.length, 2);
  assert.equal(official[0]!.team, "OK 99");
  assert.equal(official[1]!.team, "OK99");
  assert.notEqual(official[0]!.points, official[1]!.points);
});

test("identical points and place series share a rank and skip the next place", () => {
  const { official } = computeTeamCompetition([
    { categoryId: "B", place: 1, runnerName: "A1", clubName: "Alfa" },
    { categoryId: "C", place: 3, runnerName: "A2", clubName: "Alfa" },
    { categoryId: "J", place: 5, runnerName: "A3", clubName: "Alfa" },
    { categoryId: "G", place: 1, runnerName: "B1", clubName: "Beta" },
    { categoryId: "H", place: 3, runnerName: "B2", clubName: "Beta" },
    { categoryId: "K", place: 5, runnerName: "B3", clubName: "Beta" },
    { categoryId: "A", place: 10, runnerName: "G1", clubName: "Gama" },
    { categoryId: "F", place: 10, runnerName: "G2", clubName: "Gama" },
    { categoryId: "L", place: 5, runnerName: "G3", clubName: "Gama" },
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
    { categoryId: "J", place: 1, runnerName: "A1", clubName: "Alfa" },
    { categoryId: "K", place: 1, runnerName: "A2", clubName: "Alfa" },
    { categoryId: "B", place: 5, runnerName: "A3", clubName: "Alfa" },
    { categoryId: "A", place: 1, runnerName: "B1", clubName: "Beta" },
    { categoryId: "C", place: 5, runnerName: "B2", clubName: "Beta" },
    { categoryId: "L", place: 6, runnerName: "B3", clubName: "Beta" },
  ]);
  assert.equal(official[0]!.points, 22);
  assert.equal(official[1]!.points, 22);
  assert.equal(official[0]!.team, "Alfa");
  assert.equal(official[1]!.team, "Beta");
});

test("2025 official list: Nové Město 42 ahead of K.O.B. Choceň 42 on better places", () => {
  const { official, unclassified } = computeTeamCompetition(loadFixture(2025));
  const top = official.slice(0, 5).map((row) => [row.rank, row.team, row.points, row.finishers]);
  assert.deepEqual(top, [
    [1, "TJ Nové Město na Moravě", 42, 6],
    [2, "K.O.B. Choceň", 42, 30],
    [3, "OK Lokomotiva Pardubice", 38, 36],
    [4, "OK 99 Hradec Králové", 26, 4],
    [5, "TJ Spartak první brněnská", 20, 6],
  ]);
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
      "1. ženy Šaclová Lucie (20)",
      "2. dorostenci Kabuďa Vladimír (8)",
      "2. žáci Houdek Jiří (8)",
      "3. dorostenky Kakačová Michaela (6)",
    ],
  );
});

test("2021 official list: OK99 50 ahead of Lokomotiva 50 (three first places vs none)", () => {
  const top = officialNames(2021).slice(0, 5);
  assert.deepEqual(top, [
    { rank: 1, team: "OK99 Hradec Králové", points: 50, finishers: 7 },
    { rank: 2, team: "OK LOKOMOTIVA PARDUBICE", points: 50, finishers: 39 },
    { rank: 3, team: "AK ISCAREX Česká Třebová", points: 40, finishers: 6 },
    { rank: 4, team: "K.O.B. Choceň", points: 36, finishers: 39 },
    { rank: 5, team: "OK Jihlava", points: 28, finishers: 11 },
  ]);
});

test("1999 remiza under PRAVIDLA.md: Lokomotiva 46 ahead of Ok99 46 (two firsts vs one)", () => {
  const { official } = computeTeamCompetition(loadFixture(1999));
  assert.equal(official[0]!.team, "Lokomotiva Pardubice");
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
    { categoryId: "A", categoryName: "muži", time: 900, runnerName: "A", clubName: "Tým" },
    { categoryId: "A", categoryName: "muži", time: 910, runnerName: "B", clubName: "Tým" },
    { categoryId: "F", categoryName: "ženy", time: 1000, runnerName: "C", clubName: "Tým" },
  ]);
  assert.deepEqual(
    finishers.map((row) => `${row.runnerName}:${row.place}`),
    ["A:1", "B:2", "C:1"],
  );
  const { official } = computeTeamCompetition(finishers);
  assert.equal(official[0]!.points, 20 + 20);
});
