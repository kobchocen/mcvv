import assert from "node:assert/strict";
import { test } from "node:test";

import { liveTeamCompetition } from "./live";

test("live scoring uses finish times only and club ids from the start list", () => {
  const competition = liveTeamCompetition({
    categories: [
      { id: "A", name: "muži" },
      { id: "F", name: "ženy" },
      { id: "J", name: "žáci" },
    ],
    clubs: [
      { id: "ALF", name: "Alfa" },
      { id: "BET", name: "Beta" },
    ],
    runners: [
      { cat: "F", name: "Ada", fin: 100, club: 0 },
      { cat: "J", name: "Ben", fin: 110, club: 0 },
      { cat: "A", name: "Cyril", fin: 90, club: 0 },
      { cat: "A", name: "Dan", fin: 95, club: 1 },
      { cat: "F", name: "Eva", fin: 120, club: 1 },
      { cat: "J", name: "Filip", fin: 130, club: 1 },
      { cat: "A", name: "Still running", fin: null, club: 0 },
    ],
  });
  assert.equal(competition.official[0]?.team, "Alfa");
  assert.equal(competition.official[0]?.finishers, 3);
  assert.ok((competition.official[0]?.points ?? 0) > 0);
  // The runner still on the course is not a finisher.
  assert.equal(competition.official[0]?.finishers, 3);
});

test("a runner without a club is not grouped into a team", () => {
  const competition = liveTeamCompetition({
    categories: [{ id: "A", name: "muži" }],
    clubs: [{ id: "ALF", name: "Alfa" }],
    runners: [
      { cat: "A", name: "Ada", fin: 100, club: 0 },
      { cat: "A", name: "Ben", fin: 110, club: null },
      { cat: "A", name: "Cyril", fin: 120, club: 0 },
      { cat: "A", name: "Dan", fin: 130, club: 0 },
    ],
  });
  assert.equal(competition.official[0]?.team, "Alfa");
  assert.equal(competition.official[0]?.finishers, 3);
});

test("two start-list clubs with the same name and different ids are two teams", () => {
  const competition = liveTeamCompetition({
    categories: [
      { id: "A", name: "muži" },
      { id: "F", name: "ženy" },
      { id: "J", name: "žáci" },
    ],
    clubs: [
      { id: "NM1", name: "TJ Nové Město na Moravě" },
      { id: "NM2", name: "TJ Nové Město na Moravě" },
    ],
    runners: [
      { cat: "F", name: "Ada", fin: 100, club: 0 },
      { cat: "J", name: "Ben", fin: 110, club: 0 },
      { cat: "A", name: "Cyril", fin: 90, club: 0 },
      { cat: "A", name: "Dan", fin: 95, club: 1 },
      { cat: "F", name: "Eva", fin: 120, club: 1 },
      { cat: "J", name: "Filip", fin: 130, club: 1 },
    ],
  });
  assert.equal(competition.official.length, 2);
  assert.equal(competition.official[0]?.clubId, "NM1");
  assert.equal(competition.official[1]?.clubId, "NM2");
  assert.equal(competition.official[0]?.team, "TJ Nové Město na Moravě");
  assert.equal(competition.official[1]?.team, "TJ Nové Město na Moravě");
});

test("a runner whose club has no id is not a team", () => {
  const competition = liveTeamCompetition({
    categories: [{ id: "A", name: "muži" }],
    clubs: [
      { id: "", name: "Alfa" },
      { id: "000", name: "-" },
    ],
    runners: [
      { cat: "A", name: "Ada", fin: 100, club: 0 },
      { cat: "A", name: "Ben", fin: 110, club: 1 },
      { cat: "A", name: "Cyril", fin: 120, club: 0 },
      { cat: "A", name: "Dan", fin: 130, club: 0 },
    ],
  });
  assert.equal(competition.official.length, 0);
  assert.equal(competition.unclassified.length, 0);
});
