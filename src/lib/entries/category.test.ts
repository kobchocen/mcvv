import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  defaultCategory,
  eligibleCategoriesFor,
  isEligibleByBirthYear,
  pickCategoryByBirthYear,
} from "./category";

// Real category bounds from cis_mcvv_kateg (STG/DEV, race year 2026).
const CATEGORIES = [
  { id: "J", name: "žáci", age: 14, sex: "M" },
  { id: "L", name: "dorostenci", age: 18, sex: "M" },
  { id: "A", name: "muži", age: 0, sex: "M" },
  { id: "B", name: "muži nad 40 let", age: 40, sex: "M" },
  { id: "C", name: "muži nad 50 let", age: 50, sex: "M" },
  { id: "D", name: "muži nad 60 let", age: 60, sex: "M" },
  { id: "E", name: "muži nad 70 let", age: 70, sex: "M" },
  { id: "K", name: "žákyně", age: 14, sex: "F" },
  { id: "M", name: "dorostenky", age: 18, sex: "F" },
  { id: "F", name: "ženy", age: 0, sex: "F" },
  { id: "G", name: "ženy nad 40 let", age: 40, sex: "F" },
  { id: "H", name: "ženy nad 50 let", age: 50, sex: "F" },
  { id: "I", name: "ženy nad 60 let", age: 60, sex: "F" },
];
const YEAR = 2026;
const pick = (born: number, sex: "M" | "F") =>
  pickCategoryByBirthYear(born, sex, YEAR, CATEGORIES)?.id ?? null;

describe("pickCategoryByBirthYear (age = race year - birth year)", () => {
  it("youth boundaries for boys", () => {
    assert.equal(pick(2013, "M"), "J"); // 13
    assert.equal(pick(2012, "M"), "J"); // 14 -> žáci
    assert.equal(pick(2011, "M"), "L"); // 15 -> dorostenci
    assert.equal(pick(2010, "M"), "L"); // 16
    assert.equal(pick(2008, "M"), "L"); // 18
    assert.equal(pick(2007, "M"), "A"); // 19
  });
  it("youth boundaries for girls", () => {
    assert.equal(pick(2013, "F"), "K");
    assert.equal(pick(2012, "F"), "K"); // 14 -> žákyně
    assert.equal(pick(2011, "F"), "M"); // 15 -> dorostenky
    assert.equal(pick(2010, "F"), "M");
    assert.equal(pick(2008, "F"), "M");
    assert.equal(pick(2007, "F"), "F");
  });
  it("veteran boundaries", () => {
    assert.equal(pick(1987, "M"), "A"); // 39
    assert.equal(pick(1986, "M"), "B"); // 40
    assert.equal(pick(1976, "M"), "C"); // 50
    assert.equal(pick(1956, "M"), "E"); // 70
    assert.equal(pick(1966, "F"), "I"); // 60
    assert.equal(pick(1940, "F"), "I");
  });
  it("rejects impossible birth years", () => {
    assert.equal(pick(2027, "M"), null);
    assert.equal(pick(1900, "F"), null);
  });
});

describe("eligibility", () => {
  it("youth may still choose an older youth or open category", () => {
    const ids = eligibleCategoriesFor(2012, "M", YEAR, CATEGORIES).map((c) => c.id);
    assert.deepEqual(ids.sort(), ["A", "J", "L"]);
  });
  it("15-year-old is not eligible for žáci", () => {
    assert.equal(isEligibleByBirthYear(2011, "M", YEAR, CATEGORIES[0]), false);
  });
  it("defaultCategory of empty list is null", () => {
    assert.equal(defaultCategory([]), null);
  });
});
