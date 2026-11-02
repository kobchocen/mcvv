import assert from "node:assert/strict";
import { test } from "node:test";

import {
  composeRunnerName,
  keptOtherNames,
  planRunnerRename,
  splitRunnerName,
  type RunnerNameRow,
} from "./runner-rename-core";

const runner = { id: "19850001", name: "Dočkalová  Martina" };
const rows: RunnerNameRow[] = [
  { table: "mcvv_start", year: 2003, name: "" },
  { table: "mcvv_time", year: 2003, name: "Dočkalová Martina" },
  { table: "mcvv_time", year: 2001, name: "Novotná Martina" },
  { table: "mcvv_time", year: 2002, name: null },
  { table: "mcvv_start", year: 2024, name: "Dočkalová Martina" },
  { table: "mcvv_time", year: 2024, name: "Dočkalová Martina" },
  { table: "mcvv_time", year: 2025, name: null },
];

test("name helpers: compose / split 'Příjmení Jméno'", () => {
  assert.equal(composeRunnerName("  Zvěřinová ", " Martina  Anna "), "Zvěřinová Martina Anna");
  assert.deepEqual(splitRunnerName("Zvěřinová Martina Anna"), {
    lastName: "Zvěřinová",
    firstName: "Martina Anna",
  });
  assert.deepEqual(splitRunnerName(null), { lastName: "", firstName: "" });
});

test("mode all (typo): rows with the old name get the new one, other names stay", () => {
  const result = planRunnerRename({
    runner,
    lastName: "Dočkalová",
    firstName: "Martína",
    mode: "all",
    rows,
  });
  assert.ok(result.ok);
  const { plan } = result;
  assert.equal(plan.oldName, "Dočkalová Martina");
  assert.equal(plan.newName, "Dočkalová Martína");
  assert.equal(plan.fromYear, null);
  assert.deepEqual(
    plan.updates.map((u) => [u.year, u.table, u.oldName, u.newName]),
    [
      [2003, "mcvv_time", "Dočkalová Martina", "Dočkalová Martína"],
      [2024, "mcvv_time", "Dočkalová Martina", "Dočkalová Martína"],
      [2024, "mcvv_start", "Dočkalová Martina", "Dočkalová Martína"],
    ],
  );
  // Maiden name 2001 and empty rows stay (empty = current name).
  assert.deepEqual(
    plan.kept.map((row) => [row.year, row.table]),
    [
      [2001, "mcvv_time"],
      [2002, "mcvv_time"],
      [2003, "mcvv_start"],
      [2025, "mcvv_time"],
    ],
  );
});

test("mode from (wedding): years ≥ X get the new name, older empty rows the old one (Q251)", () => {
  const result = planRunnerRename({
    runner,
    lastName: "Zvěřinová",
    firstName: "Martina",
    mode: "from",
    fromYear: 2024,
    rows,
  });
  assert.ok(result.ok);
  assert.deepEqual(
    result.plan.updates.map((u) => [u.year, u.table, u.oldName, u.newName]),
    [
      [2002, "mcvv_time", null, "Dočkalová Martina"],
      [2003, "mcvv_start", "", "Dočkalová Martina"],
      [2024, "mcvv_time", "Dočkalová Martina", "Zvěřinová Martina"],
      [2024, "mcvv_start", "Dočkalová Martina", "Zvěřinová Martina"],
      [2025, "mcvv_time", null, "Zvěřinová Martina"],
    ],
  );
  assert.deepEqual(
    result.plan.kept.map((row) => [row.year, row.table]),
    [
      [2001, "mcvv_time"],
      [2003, "mcvv_time"],
    ],
  );
});

test("from a future year (registered before the wedding takes effect): only backfill", () => {
  const result = planRunnerRename({
    runner,
    lastName: "Zvěřinová",
    firstName: "Martina",
    mode: "from",
    fromYear: 2026,
    rows,
  });
  assert.ok(result.ok);
  assert.ok(result.plan.updates.every((u) => u.newName === "Dočkalová Martina"));
});

test("validation: empty, too long, bad year, unchanged", () => {
  const base = { runner, rows, mode: "all" as const };
  assert.deepEqual(planRunnerRename({ ...base, lastName: " ", firstName: "A" }), {
    ok: false,
    error: "empty",
  });
  assert.deepEqual(planRunnerRename({ ...base, lastName: "X".repeat(45), firstName: "Yyyyyy" }), {
    ok: false,
    error: "too_long",
  });
  assert.deepEqual(
    planRunnerRename({ ...base, mode: "from", fromYear: null, lastName: "A", firstName: "B" }),
    { ok: false, error: "year" },
  );
  assert.deepEqual(planRunnerRename({ ...base, lastName: "Dočkalová", firstName: "Martina" }), {
    ok: false,
    error: "unchanged",
  });
});

test("case-only fix is a change", () => {
  const result = planRunnerRename({
    runner: { id: "19850001", name: "dočkalová martina" },
    lastName: "Dočkalová",
    firstName: "Martina",
    mode: "all",
    rows: [{ table: "mcvv_time", year: 2020, name: "dočkalová martina" }],
  });
  assert.ok(result.ok);
  assert.equal(result.plan.updates.length, 1);
});

test("keptOtherNames lists only other historical names, grouped with years", () => {
  const result = planRunnerRename({
    runner,
    lastName: "Zvěřinová",
    firstName: "Martina",
    mode: "from",
    fromYear: 2024,
    rows: [...rows, { table: "mcvv_start", year: 2001, name: "Novotná Martina" }],
  });
  assert.ok(result.ok);
  assert.deepEqual(keptOtherNames(result.plan), [{ name: "Novotná Martina", years: [2001] }]);
});
