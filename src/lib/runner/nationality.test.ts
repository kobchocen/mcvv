import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  COUNTRY_CODES,
  computeNationalityStats,
  countryName,
  countryOptions,
  flagEmoji,
  listFlag,
  normalizeNationality,
} from "./nationality";

describe("nationality codes", () => {
  it("has unique two-letter codes", () => {
    assert.equal(new Set(COUNTRY_CODES).size, COUNTRY_CODES.length);
    assert.ok(COUNTRY_CODES.every((code) => /^[A-Z]{2}$/.test(code)));
  });

  it("normalizes form input", () => {
    assert.equal(normalizeNationality(" cz "), "CZ");
    assert.equal(normalizeNationality("SK"), "SK");
    assert.equal(normalizeNationality(""), null);
    assert.equal(normalizeNationality("XX"), null);
    assert.equal(normalizeNationality(undefined), null);
  });

  it("builds flag emoji from regional indicators", () => {
    assert.equal(flagEmoji("CZ"), "🇨🇿");
    assert.equal(flagEmoji("SK"), "🇸🇰");
    assert.equal(flagEmoji("XX"), "");
    assert.equal(flagEmoji(null), "");
  });

  it("names countries per locale", () => {
    assert.equal(countryName("DE", "cs"), "Německo");
    assert.equal(countryName("DE", "en"), "Germany");
  });

  it("puts common countries first and sorts the rest", () => {
    const { common, other } = countryOptions("cs");
    assert.equal(common[0]?.code, "CZ");
    assert.ok(!other.some((option) => option.code === "CZ"));
    assert.equal(common.length + other.length, COUNTRY_CODES.length);
  });

  it("shows list flags only for foreign runners", () => {
    assert.equal(listFlag("CZ"), null);
    assert.equal(listFlag("SK"), "SK");
    assert.equal(listFlag(null), null);
  });
});

describe("computeNationalityStats", () => {
  const nat = new Map([
    ["19800001", "CZ"],
    ["19800002", "SK"],
    ["19850001", "SK"],
    ["19900001", "PL"],
  ]);
  const results = [
    { year: 2024, runnerId: "19800001", time: 1500 },
    { year: 2024, runnerId: "19800002", time: 1400 },
    { year: 2024, runnerId: "19990001", time: 1300 },
    { year: 2025, runnerId: "19800002", time: 1350 },
    { year: 2025, runnerId: "19850001", time: 1450 },
    { year: 2025, runnerId: "19900001", time: 1600 },
  ];

  it("aggregates per country", () => {
    const stats = computeNationalityStats(results, nat);
    assert.deepEqual(
      stats.countries.map((row) => [
        row.code,
        row.runners,
        row.starts,
        row.firstYear,
        row.lastYear,
      ]),
      [
        ["SK", 2, 3, 2024, 2025],
        ["CZ", 1, 1, 2024, 2024],
        ["PL", 1, 1, 2025, 2025],
      ],
    );
    assert.deepEqual(stats.countries[0]?.best, { runnerId: "19800002", time: 1350, year: 2025 });
    assert.equal(stats.unknownRunners, 1);
  });

  it("aggregates per year (newest first)", () => {
    const stats = computeNationalityStats(results, nat);
    assert.deepEqual(stats.years, [
      { year: 2025, countries: 2, foreign: 3, unknown: 0 },
      { year: 2024, countries: 2, foreign: 1, unknown: 1 },
    ]);
  });
});
