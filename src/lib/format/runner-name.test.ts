import assert from "node:assert/strict";
import { test } from "node:test";

import { displayRunnerName, runnerNameFor, shortRunnerName } from "./runner-name";

test("same name stays unchanged", () => {
  assert.equal(displayRunnerName("Vetchá Adéla", "Vetchá Adéla"), "Vetchá Adéla");
  assert.equal(displayRunnerName("Vetchá  Adéla ", "vetchá adéla"), "Vetchá Adéla");
});

test("surname change shows maiden name in brackets", () => {
  assert.equal(displayRunnerName("Stránská Adéla", "Vetchá Adéla"), "Vetchá (Stránská) Adéla");
});

test("different first name shows full stored name in brackets", () => {
  assert.equal(displayRunnerName("Novák Jan", "Nováková Jana"), "Nováková Jana (Novák Jan)");
  assert.equal(displayRunnerName("Novák", "Novák Jan"), "Novák Jan (Novák)");
});

test("missing values fall back", () => {
  assert.equal(displayRunnerName(null, "Vetchá Adéla"), "Vetchá Adéla");
  assert.equal(displayRunnerName("Stránská Adéla", null), "Stránská Adéla");
  assert.equal(displayRunnerName(null, undefined), null);
});

test("results context keeps the name the runner had in that year", () => {
  assert.equal(
    runnerNameFor("results", "Dočkalová Martina", "Zvěřinová Martina"),
    "Dočkalová Martina",
  );
  assert.equal(runnerNameFor("results", " Dočkalová  Martina", null), "Dočkalová Martina");
  assert.equal(runnerNameFor("results", null, "Zvěřinová Martina"), "Zvěřinová Martina");
  assert.equal(runnerNameFor("results", "", ""), null);
});

test("stats context shows only the current name", () => {
  assert.equal(
    runnerNameFor("stats", "Dočkalová Martina", "Zvěřinová Martina"),
    "Zvěřinová Martina",
  );
  assert.equal(runnerNameFor("stats", "Dočkalová Martina", null), "Dočkalová Martina");
  assert.equal(runnerNameFor("stats", null, undefined), null);
});

test("profile context shows current with former name", () => {
  assert.equal(
    runnerNameFor("profile", "Dočkalová Martina", "Zvěřinová Martina"),
    "Zvěřinová (Dočkalová) Martina",
  );
});

test("shortRunnerName: initial of the first name and the surname", () => {
  assert.equal(shortRunnerName("Šlajs Tomáš"), "T. Šlajs");
  assert.equal(shortRunnerName("  Nová   eva "), "E. Nová");
  assert.equal(shortRunnerName("Horáček"), "Horáček");
  assert.equal(shortRunnerName(null), "");
});
