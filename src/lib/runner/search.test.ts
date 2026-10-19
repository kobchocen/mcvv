import assert from "node:assert/strict";
import { test } from "node:test";

import { foldName, searchHitName } from "./search";

test("foldName ignores case and diacritics", () => {
  assert.equal(foldName("  Dočkalová   Martina "), "dockalova martina");
  assert.equal(foldName("ZVĚŘINOVÁ"), "zverinova");
});

test("hit on the current name keeps the current name", () => {
  assert.equal(
    searchHitName("zvěřinová", "Zvěřinová Martina", ["Dočkalová Martina"]),
    "Zvěřinová Martina",
  );
  assert.equal(
    searchHitName("ZVERINOVA", "Zvěřinová Martina", ["Dočkalová Martina"]),
    "Zvěřinová Martina",
  );
});

test("hit on a former name shows the profile format", () => {
  for (const q of ["dočkalová", "dockalova", "DOČKAL"]) {
    assert.equal(
      searchHitName(q, "Zvěřinová Martina", ["Dočkalová Martina"]),
      "Zvěřinová (Dočkalová) Martina",
    );
  }
});

test("first name hit or unknown stored names fall back to the current name", () => {
  assert.equal(
    searchHitName("martina", "Zvěřinová Martina", ["Dočkalová Martina"]),
    "Zvěřinová Martina",
  );
  assert.equal(
    searchHitName("dockalova", "Zvěřinová Martina", [null, "Novák Jan"]),
    "Zvěřinová Martina",
  );
});
