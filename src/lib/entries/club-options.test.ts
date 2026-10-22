import assert from "node:assert/strict";
import { test } from "node:test";

import { buildClubOptions, clubOptionValue, findClubOption } from "./club-options";

const rows = [
  { id: "CHC", year: 2024, name: "K.O.B. Choceň" },
  { id: "CHC", year: 1993, name: "KOB Choceň" },
  { id: "216", year: 2018, name: "KOB Choceń" },
  { id: "216", year: 2025, name: "K.O.B. Choceň" },
  { id: "412", year: 2026, name: "Běžci Vysoké Mýto" },
  { id: "000", year: 2026, name: "" },
  { id: "999", year: 2020, name: "bez klubu" },
  { id: "AAA", year: 2001, name: "Atletika Ústí" },
];

test("all ids, newest name per id, placeholders skipped, Czech order", () => {
  const options = buildClubOptions(rows);
  assert.deepEqual(
    options.map((option) => [option.id, option.name, option.label]),
    [
      ["AAA", "Atletika Ústí", "AAA · 2001"],
      ["412", "Běžci Vysoké Mýto", "412 · 2026"],
      ["216", "K.O.B. Choceň", "216 · 2018–2025"],
      ["CHC", "K.O.B. Choceň", "CHC · 1993–2024"],
    ],
  );
});

test("a name shared by several ids gets the id in its value", () => {
  const options = buildClubOptions(rows);
  assert.equal(options.find((option) => option.id === "CHC")?.value, "K.O.B. Choceň (CHC)");
  assert.equal(options.find((option) => option.id === "216")?.value, "K.O.B. Choceň (216)");
  assert.equal(options.find((option) => option.id === "412")?.value, "Běžci Vysoké Mýto");
});

test("findClubOption matches the value exactly, ignoring case and spaces", () => {
  const options = buildClubOptions(rows);
  assert.equal(findClubOption("  běžci  vysoké mýto ", options)?.id, "412");
  assert.equal(findClubOption("K.O.B. Choceň (216)", options)?.id, "216");
  // Plain shared name is not a choice: the server falls back to the name lookup.
  assert.equal(findClubOption("K.O.B. Choceň", options), undefined);
  assert.equal(findClubOption("Nový klub", options), undefined);
  assert.equal(findClubOption("", options), undefined);
});

test("clubOptionValue shows the option text for an id", () => {
  const options = buildClubOptions(rows);
  assert.equal(clubOptionValue("CHC", "x", options), "K.O.B. Choceň (CHC)");
  assert.equal(clubOptionValue("000", "", options), "");
});
