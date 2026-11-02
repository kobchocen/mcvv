import assert from "node:assert/strict";
import { test } from "node:test";

import { matchRunnerByPreviousName } from "./runner-match";

const existingIds = new Set(["19855001", "19855002", "19850001"]);

test("previous name: one unambiguous runner (name + birth year + sex) matches", () => {
  assert.equal(
    matchRunnerByPreviousName({
      wanted: "  dočkalová   MARTINA",
      birthYear: 1985,
      sexDigit: "5",
      rows: [
        { runnerId: "19855001", name: "Dočkalová Martina" },
        { runnerId: "19855001", name: "Dočkalová Martina" },
        { runnerId: "19855002", name: "Jiná Martina" },
        { runnerId: "19855002", name: null },
      ],
      existingIds,
    }),
    "19855001",
  );
});

test("previous name: other sex, other birth year or missing runner do not match", () => {
  const rows = [
    { runnerId: "19850001", name: "Novák Jan" },
    { runnerId: "19865001", name: "Novák Jan" },
    { runnerId: "19855009", name: "Novák Jan" },
  ];
  assert.equal(
    matchRunnerByPreviousName({
      wanted: "Novák Jan",
      birthYear: 1985,
      sexDigit: "5",
      rows,
      existingIds,
    }),
    null,
  );
});

test("previous name: two candidates are ambiguous → null", () => {
  assert.equal(
    matchRunnerByPreviousName({
      wanted: "Nováková Eva",
      birthYear: 1985,
      sexDigit: "5",
      rows: [
        { runnerId: "19855001", name: "Nováková Eva" },
        { runnerId: "19855002", name: "Nováková Eva" },
      ],
      existingIds,
    }),
    null,
  );
});

test("previous name: empty input never matches empty stored names", () => {
  assert.equal(
    matchRunnerByPreviousName({
      wanted: " ",
      birthYear: 1985,
      sexDigit: "5",
      rows: [{ runnerId: "19855001", name: "" }],
      existingIds,
    }),
    null,
  );
});
