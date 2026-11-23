import assert from "node:assert/strict";
import { test } from "node:test";

import {
  announcementDiff,
  announcementSettingKey,
  makeAnnouncement,
  parseAnnouncement,
} from "./snapshot";
import type { TeamCompetition } from "./scoring";

const competition: TeamCompetition = {
  official: [
    {
      rank: 1,
      team: "Alfa",
      points: 42,
      finishers: 6,
      counted: [],
      classified: true,
    },
    {
      rank: 2,
      team: "Beta",
      points: 40,
      finishers: 8,
      counted: [],
      classified: true,
    },
  ],
  unclassified: [],
};

test("setting key stays within 64 characters", () => {
  assert.ok(announcementSettingKey(2026).length < 64);
});

test("round-trips a 12:20 announcement and detects a later official change", () => {
  const announced = makeAnnouncement(2026, competition, new Date("2026-12-06T11:20:00.000Z"));
  const raw = JSON.stringify(announced);
  const parsed = parseAnnouncement(raw);
  assert.equal(parsed?.year, 2026);
  assert.equal(parsed?.official[0]?.team, "Alfa");
  const same = announcementDiff(parsed!.official, competition.official);
  assert.equal(same.changed, false);
  const changed = announcementDiff(parsed!.official, [
    { ...competition.official[0]!, team: "Gama" },
    competition.official[1]!,
  ]);
  assert.equal(changed.changed, true);
});
