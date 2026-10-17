import assert from "node:assert/strict";
import { test } from "node:test";

import { displayRunnerName } from "./runner-name";

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
