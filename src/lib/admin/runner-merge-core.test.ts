import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { Prisma } from "@prisma/client";

import {
  findRunnerMergeConflicts,
  planRunnerMerge,
  RUNNER_MERGE_MODELS,
  runnerDuplicateSuggestions,
  runnerMergeHistoryEntry,
  runnerMergeYears,
  type RunnerMergeSide,
} from "./runner-merge-core";

const main: RunnerMergeSide = {
  id: "19815021",
  name: "Hozáková Leona",
  nationality: null,
  rows: [
    { table: "mcvv_time", year: 2019, key: "2019" },
    { table: "mcvv_start", year: 2019, key: "2019" },
    { table: "mcvv_bezec_fotka", year: null, key: "77" },
  ],
};
const other: RunnerMergeSide = {
  id: "19810034",
  name: "Hozáková  Leona",
  nationality: "CZ",
  rows: [
    { table: "mcvv_prihlaska_radek", year: 2026, key: "2026" },
    { table: "mcvv_time", year: 2018, key: "2018" },
    { table: "mcvv_spec_start_partner", year: 2026, key: "2026" },
    { table: "mcvv_bezec_fotka", year: null, key: "77" },
    { table: "mcvv_bezec_fotka", year: null, key: "78" },
    { table: "webimages", year: 2018, key: "5" },
  ],
};

describe("planRunnerMerge", () => {
  it("moves all rows of the duplicate, drops photo tags the main already has", () => {
    const result = planRunnerMerge(main, other);
    assert.ok(result.ok);
    const { plan } = result;
    assert.equal(plan.mainId, "19815021");
    assert.equal(plan.otherId, "19810034");
    assert.deepEqual(
      plan.droppedPhotoTags.map((row) => row.key),
      ["77"],
    );
    assert.equal(plan.moved.length, 5);
    assert.equal(plan.counts.mcvv_bezec_fotka, 1);
    assert.equal(plan.counts.mcvv_time, 1);
    assert.equal(plan.counts.mcvv_spec_start_partner, 1);
    assert.equal(plan.counts.mcvv_start, 0);
    // Wrong sex in the duplicate id → warning; same birth year and name → none.
    assert.deepEqual(plan.warnings, ["sex"]);
    assert.equal(plan.nationality, "CZ");
  });

  it("blocks runners with a record in the same year (Q253)", () => {
    const clash = {
      ...other,
      rows: [...other.rows, { table: "mcvv_start" as const, year: 2019, key: "2019" }],
    };
    const result = planRunnerMerge(main, clash);
    assert.deepEqual(result, {
      ok: false,
      error: "conflict",
      conflicts: [{ year: 2019, main: ["mcvv_time", "mcvv_start"], other: ["mcvv_start"] }],
    });
  });

  it("photos and web images never conflict (no year key)", () => {
    assert.deepEqual(
      findRunnerMergeConflicts(
        [{ table: "webimages", year: 2018, key: "1" }],
        [{ table: "webimages", year: 2018, key: "2" }],
      ),
      [],
    );
  });

  it("same runner or missing runner", () => {
    assert.deepEqual(planRunnerMerge(main, main), { ok: false, error: "same" });
    assert.deepEqual(planRunnerMerge(main, null), { ok: false, error: "not_found" });
  });

  it("warns about a different birth year and name, keeps main nationality", () => {
    const result = planRunnerMerge(
      { ...main, nationality: "SK" },
      { id: "19825003", name: "Hozáková Lea", nationality: "CZ", rows: [] },
    );
    assert.ok(result.ok);
    assert.deepEqual(result.plan.warnings, ["birth_year", "name"]);
    assert.equal(result.plan.nationality, null);
  });

  it("runnerMergeYears lists race years, newest first", () => {
    assert.deepEqual(runnerMergeYears(other.rows), [2026, 2018]);
  });
});

describe("runnerDuplicateSuggestions", () => {
  it("pairs the same name with birth year ±1 and no shared year; main = more years", () => {
    const suggestions = runnerDuplicateSuggestions([
      { id: "19810034", name: "Hozáková Leona", years: [] },
      { id: "19815021", name: "hozáková leona", years: [2019, 2021] },
      { id: "19770023", name: "Kučera Jiří", years: [2017, 2023] },
      { id: "19770025", name: "Kučera Jiří", years: [2023] },
      { id: "19490002", name: "Šimůnek Jan", years: [] },
      { id: "19820012", name: "Šimůnek Jan", years: [] },
      { id: "19780013", name: "Doležal Marek", years: [1999] },
      { id: "19790004", name: "Doležal Marek", years: [1997, 2001] },
    ]);
    assert.deepEqual(
      suggestions.map((pair) => [pair.main.id, pair.other.id]),
      [
        ["19815021", "19810034"],
        ["19790004", "19780013"],
      ],
    );
  });
});

describe("schema coverage", () => {
  it("merges every model that references the runner (cis_bezec)", () => {
    const referencing = Prisma.dmmf.datamodel.models
      .filter(
        (model) =>
          model.name !== "Runner" &&
          model.fields.some((field) => field.kind === "object" && field.type === "Runner"),
      )
      .map((model) => model.name)
      .sort();
    assert.deepEqual(referencing, [...RUNNER_MERGE_MODELS].sort());
  });
});

describe("runnerMergeHistoryEntry", () => {
  it("reads ids, names and the row total from the audit detail", () => {
    const at = new Date("2026-11-02T12:00:00Z");
    assert.deepEqual(
      runnerMergeHistoryEntry({
        id: 5,
        loggedAt: at,
        actorEmail: "admin@example.test",
        target: "runner:19815021",
        detail: {
          mainId: "19815021",
          otherId: "19810034",
          mainName: "Hozáková Leona",
          otherName: "Hozáková Leona",
          counts: { mcvv_time: 5, mcvv_start: 4, webimages: 0 },
        },
      }),
      {
        id: 5,
        at,
        actor: "admin@example.test",
        mainId: "19815021",
        otherId: "19810034",
        mainName: "Hozáková Leona",
        otherName: "Hozáková Leona",
        rows: 9,
      },
    );
  });

  it("tolerates a broken detail", () => {
    const entry = runnerMergeHistoryEntry({
      id: 6,
      loggedAt: new Date(0),
      actorEmail: null,
      target: "runner:19815021",
      detail: null,
    });
    assert.equal(entry.mainId, "19815021");
    assert.equal(entry.otherId, "?");
    assert.equal(entry.rows, 0);
    assert.equal(entry.actor, "—");
  });
});
