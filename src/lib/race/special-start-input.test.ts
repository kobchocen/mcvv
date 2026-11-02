import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  filterPartnerOptions,
  normalizeSearch,
  partnerIdFromInput,
  partnerOptionLabel,
  type PartnerOption,
} from "./special-start-input";

const OPTIONS: PartnerOption[] = [
  { runnerId: "26000001", name: "Šťastná Eva", birthYear: "1985", clubName: "SK Kopec", bib: 641 },
  { runnerId: "26000002", name: "Novák Jan", birthYear: "1983", clubName: "AC Mělník", bib: 312 },
  { runnerId: "26000003", name: "Nováková Petra", birthYear: "1990", clubName: "", bib: null },
  { runnerId: "26000004", name: "Adam Novák", birthYear: "2001", clubName: "SK Kopec", bib: null },
  { runnerId: "26000005", name: "Černý Ivo", birthYear: "1983", clubName: "TJ Sokol", bib: 45 },
];
const names = (list: PartnerOption[]) => list.map((o) => o.name);

describe("partner autocomplete (Q231)", () => {
  it("needs at least 2 characters", () => {
    assert.deepEqual(filterPartnerOptions(OPTIONS, ""), []);
    assert.deepEqual(filterPartnerOptions(OPTIONS, " n "), []);
    assert.equal(filterPartnerOptions(OPTIONS, "no").length, 3);
  });
  it("ignores diacritics and case", () => {
    assert.equal(normalizeSearch(" Šťastná "), "stastna");
    assert.deepEqual(names(filterPartnerOptions(OPTIONS, "stast")), ["Šťastná Eva"]);
    assert.deepEqual(names(filterPartnerOptions(OPTIONS, "CERN")), ["Černý Ivo"]);
    assert.deepEqual(names(filterPartnerOptions(OPTIONS, "melnik")), ["Novák Jan"]);
  });
  it("puts name-prefix matches first, then sorts by name", () => {
    assert.deepEqual(names(filterPartnerOptions(OPTIONS, "novak")), [
      "Novák Jan",
      "Nováková Petra",
      "Adam Novák",
    ]);
  });
  it("matches every token against name, year, club, bib and id", () => {
    assert.deepEqual(names(filterPartnerOptions(OPTIONS, "1983")), ["Černý Ivo", "Novák Jan"]);
    assert.deepEqual(names(filterPartnerOptions(OPTIONS, "novak 1983")), ["Novák Jan"]);
    assert.deepEqual(names(filterPartnerOptions(OPTIONS, "kopec 2001")), ["Adam Novák"]);
    assert.deepEqual(names(filterPartnerOptions(OPTIONS, "641")), ["Šťastná Eva"]);
    assert.deepEqual(names(filterPartnerOptions(OPTIONS, "26000005")), ["Černý Ivo"]);
  });
  it("excludes the runner himself and respects the limit", () => {
    assert.deepEqual(names(filterPartnerOptions(OPTIONS, "novak", { exclude: "26000002" })), [
      "Nováková Petra",
      "Adam Novák",
    ]);
    assert.equal(filterPartnerOptions(OPTIONS, "26", { limit: 2 }).length, 2);
  });
  it("labels options and reads the posted id", () => {
    assert.equal(partnerOptionLabel(OPTIONS[1]), "Novák Jan · 1983 · AC Mělník");
    assert.equal(partnerOptionLabel(OPTIONS[2]), "Nováková Petra · 1990");
    assert.equal(partnerIdFromInput(" 26000002 "), "26000002");
    assert.equal(partnerIdFromInput("Novák Jan · 1983 [26000002]"), "26000002");
    assert.equal(partnerIdFromInput("Novák"), null);
    assert.equal(partnerIdFromInput("2600000"), null);
  });
});
