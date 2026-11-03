import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { isStatSlug } from "@/lib/stats/core";

import {
  categoryBirthYearBound,
  FREE_ENTRY_LINKS,
  formatFreeEntryDeadline,
  hasRozpisData,
} from "./program";

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

describe("formatFreeEntryDeadline (Q417)", () => {
  const deadline = new Date(Date.UTC(2026, 11, 2));
  it("formats the online deadline with weekday and non-breaking spaces", () => {
    assert.equal(formatFreeEntryDeadline(deadline, "cs"), "st\u00A02.\u00A012.\u00A02026");
    assert.equal(formatFreeEntryDeadline(deadline, "en"), "Wed\u00A02\u00A0December\u00A02026");
  });
  it("returns null without a deadline", () => {
    assert.equal(formatFreeEntryDeadline(null, "cs"), null);
    assert.equal(formatFreeEntryDeadline(undefined, "en"), null);
  });
});

describe("free-entry sentence (Q417)", () => {
  const locales = ["cs", "en"] as const;
  const read = (locale: (typeof locales)[number]) =>
    JSON.parse(readFileSync(`src/i18n/locales/${locale}/common.json`, "utf8")).Program.fees as {
      freeEntry: string;
      freeEntryOpen: string;
    };
  it("links winners and veterans lists that exist in the statistics", () => {
    assert.ok(isStatSlug(FREE_ENTRY_LINKS.winners));
    assert.ok(isStatSlug(FREE_ENTRY_LINKS.veterans));
    for (const locale of locales) {
      const fees = read(locale);
      for (const text of [fees.freeEntry, fees.freeEntryOpen]) {
        assert.match(text, /<winners>[^<]+<\/winners>/);
        assert.match(text, /<veterans>[^<]+<\/veterans>/);
      }
      assert.match(fees.freeEntry, /\{date\}/);
      assert.doesNotMatch(fees.freeEntryOpen, /\{date\}/);
    }
  });
  it("uses the approved Czech wording", () => {
    const fees = read("cs");
    const plain = (text: string) => text.replace(/<\/?(winners|veterans)>/g, "");
    assert.equal(
      plain(fees.freeEntry)
        .replace("{date}", "st 2. 12. 2026")
        .replace(/\u00A0/g, " "),
      "Vítězové kategorií Muži a Ženy a členové Klubu veteránů MCVV mají startovné zdarma při online přihlášce do st 2. 12. 2026.",
    );
  });
});
