import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildRunnerYears,
  previousRunnerNames,
  runnerSearchPattern,
} from "./runner-directory-core";

test("buildRunnerYears merges results, starts and registrations by year (newest first)", () => {
  const years = buildRunnerYears({
    results: [{ year: 2024, runnerName: "Dočkalová Martina", clubId: "CHC" }],
    starts: [
      { year: 2024, runnerName: null, clubId: "XXX" },
      { year: 2017, runnerName: null, clubId: "KOB" },
    ],
    lines: [{ year: 2026, registrationId: 12, clubId: "CHC" }],
  });
  assert.deepEqual(years, [
    { year: 2026, clubId: "CHC", registrationId: 12 },
    {
      year: 2024,
      clubId: "CHC",
      registrationId: null,
      startName: null,
      resultName: "Dočkalová Martina",
    },
    { year: 2017, clubId: "KOB", registrationId: null, startName: null },
  ]);
});

test("previousRunnerNames skips the current name, empty and duplicate names", () => {
  assert.deepEqual(
    previousRunnerNames("Zvěřinová Martina", [
      "Dočkalová Martina",
      "",
      null,
      "zvěřinová  martina",
      "Dočkalová Martina",
      "Dočkalová Martína",
    ]),
    ["Dočkalová Martina", "Dočkalová Martína"],
  );
});

test("runnerSearchPattern needs 2 chars and escapes LIKE wildcards", () => {
  assert.equal(runnerSearchPattern(" a "), null);
  assert.equal(runnerSearchPattern("Novák  J"), "%Novák J%");
  assert.equal(runnerSearchPattern("50%_x"), "%50\\%\\_x%");
});
