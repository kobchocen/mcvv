import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { categoryBirthYearBound, hasRozpisData } from "./program";

const edition34 = {
  date: new Date(Date.UTC(2026, 11, 6)),
  startAdultMail: 100,
  startKidsMail: 50,
  startAdultPlace: 200,
  startKidsPlace: 100,
  finAdult1: 2000,
  finVet1: 300,
};

describe("hasRozpisData", () => {
  it("accepts an edition with date, fees and prizes", () => {
    assert.equal(hasRozpisData(edition34), true);
  });
  it("rejects missing editions or missing fee / prize data", () => {
    assert.equal(hasRozpisData(null), false);
    assert.equal(hasRozpisData({ ...edition34, startAdultMail: null }), false);
    assert.equal(hasRozpisData({ ...edition34, finVet1: null }), false);
    assert.equal(hasRozpisData({ ...edition34, date: null }), false);
  });
});

describe("categoryBirthYearBound", () => {
  it("is relative to the Rozpis year (2026 = edition 34 unchanged)", () => {
    assert.equal(categoryBirthYearBound(14, 2026), 2012);
    assert.equal(categoryBirthYearBound(40, 2026), 1986);
    assert.equal(categoryBirthYearBound(0, 2026), null);
    assert.equal(categoryBirthYearBound(14, 2027), 2013);
  });
});
