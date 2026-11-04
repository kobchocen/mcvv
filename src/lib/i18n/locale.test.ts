import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { mergeMessages } from "@/i18n/messages";
import routingConfig from "@/next-intl.config";
import { formatDate, formatDateTime, formatRaceDate, formatRaceDay } from "@/lib/format/date";
import { formatOnlineDeadline, formatRaceDayShort } from "@/lib/race/program";
import { languageAlternates, ogAlternateLocales, ogLocale, siteDescription } from "@/lib/site/seo";
import { dateTimeLabel, dayLabel, termEndLabel } from "@/lib/slots/term-end";

import { documentLocale, intlTag, isLocale, siteLocale } from "./locale";

const plain = (value: string) => value.replace(/\s/g, " ");

describe("locale helpers (#273)", () => {
  it("accepts exactly the five web locales", () => {
    for (const l of ["cs", "en", "de", "pl", "uk"]) assert.equal(isLocale(l), true, l);
    for (const l of ["ua", "fr", "", null, undefined, 1]) assert.equal(isLocale(l), false);
    assert.equal(siteLocale("pl"), "pl");
    assert.equal(siteLocale("fr"), "cs");
  });

  it("e-mails, PDFs and receipts are Czech for cs and English for every other locale", () => {
    assert.equal(documentLocale("cs"), "cs");
    for (const l of ["en", "de", "pl", "uk"]) assert.equal(documentLocale(l), "en", l);
    assert.equal(documentLocale("fr"), "cs");
    assert.equal(documentLocale(undefined), "cs");
  });

  it("maps locales to Intl tags", () => {
    assert.equal(intlTag("cs"), "cs-CZ");
    assert.equal(intlTag("en"), "en-GB");
    assert.equal(intlTag("de"), "de-DE");
    assert.equal(intlTag("pl"), "pl-PL");
    assert.equal(intlTag("uk"), "uk-UA");
    assert.equal(intlTag("xx"), "cs-CZ");
  });
});

describe("mergeMessages", () => {
  it("fills missing keys from the fallback, deeply; arrays are replaced", () => {
    const base = { A: { x: "x", y: { z: "z" } }, B: { list: ["1", "2"] }, C: { only: "en" } };
    const own = { A: { y: { z: "Z" } }, B: { list: ["eins"] } };
    assert.deepEqual(mergeMessages(base, own), {
      A: { x: "x", y: { z: "Z" } },
      B: { list: ["eins"] },
      C: { only: "en" },
    });
    assert.equal(base.A.y.z, "z", "base is not mutated");
  });
});

describe("date formatting in de, pl and uk", () => {
  const race = new Date("2026-12-06T09:00:00Z");

  it("keeps cs and en unchanged", () => {
    assert.equal(plain(formatRaceDate(race, "cs")), "Neděle 6. 12. 2026");
    assert.equal(plain(formatRaceDate(race, "en")), "Sunday 6 December 2026");
    assert.equal(plain(formatDate(race, "en")), "6 Dec 2026");
  });

  it("uses each language's own conventions", () => {
    assert.equal(plain(formatDate(race, "de")), "6.12.2026");
    assert.equal(plain(formatRaceDate(race, "de")), "Sonntag 6. Dezember 2026");
    assert.equal(plain(formatRaceDay(race, "de")), "Sonntag, 6. Dezember");
    assert.equal(plain(formatDateTime(race, "de")), "6.12.2026, 10:00");
    assert.equal(plain(formatRaceDate(race, "pl")), "Niedziela 6 grudnia 2026");
    assert.equal(plain(formatRaceDay(race, "uk")), "Неділя, 6 грудня");
  });

  it("writes entry deadlines as phrases", () => {
    const standardEnd = { to: new Date("2026-12-02T23:00:00Z") };
    assert.equal(termEndLabel(standardEnd, "de"), "am Mittwoch, 2.12. um 23:59");
    assert.equal(termEndLabel(standardEnd, "pl"), "w środę 2.12. o 23:59");
    assert.equal(termEndLabel(standardEnd, "uk"), "у середу 2.12. о 23:59");
    assert.equal(termEndLabel(standardEnd, "en"), "on Wednesday 2/12 at 23:59");
    assert.equal(dateTimeLabel(new Date("2026-12-05T17:00:00Z"), "pl"), "w sobotę 5.12. o 18:00");
    assert.equal(dayLabel(race, "de"), "am Sonntag, 6.12.");
    assert.equal(dayLabel(race, "uk"), "у неділю 6.12.");
    assert.equal(dayLabel(new Date("2026-12-01T09:00:00Z"), "pl"), "we wtorek 1.12.");
  });

  it("formats the programme dates", () => {
    assert.equal(
      plain(formatRaceDayShort(new Date(Date.UTC(2026, 11, 6)), "de") ?? ""),
      "So., 6.12.",
    );
    const online = formatOnlineDeadline(new Date("2026-12-02T23:00:00Z"), "de");
    assert.equal(plain(online?.short ?? ""), "Mi., 2.12.");
    assert.match(plain(online?.long ?? ""), /^Mi\., 2\.12\.2026, 23:59$/);
  });
});

describe("SEO metadata", () => {
  it("lists hreflang alternates for every locale plus x-default", () => {
    assert.deepEqual(languageAlternates("https://mcvv.org", "/results"), {
      cs: "https://mcvv.org/cs/results",
      en: "https://mcvv.org/en/results",
      de: "https://mcvv.org/de/results",
      pl: "https://mcvv.org/pl/results",
      uk: "https://mcvv.org/uk/results",
      "x-default": "https://mcvv.org/cs/results",
    });
  });

  it("has a description and Open Graph locale for every locale", () => {
    for (const l of routingConfig.locales) {
      assert.ok(siteDescription(l).includes("Choc"), l);
      assert.match(ogLocale(l), /^[a-z]{2}_[A-Z]{2}$/);
      assert.equal(ogAlternateLocales(l).length, routingConfig.locales.length - 1);
    }
    assert.equal(siteDescription("cs"), "Tradiční zimní lesní kros v Chocni.");
    assert.equal(ogLocale("uk"), "uk_UA");
  });
});

describe("proxy matcher", () => {
  it("lists every locale (keep in sync with next-intl.config.ts)", () => {
    const source = readFileSync(new URL("../../proxy.ts", import.meta.url), "utf8");
    const group = `(${routingConfig.locales.join("|")})`;
    assert.ok(source.includes(`"/${group}/admin/:path*"`), "admin matcher");
    assert.ok(source.includes(`"/${group}/bezec/:path*"`), "bezec matcher");
    for (const l of routingConfig.locales) {
      assert.ok(source.includes(`${l}/|${l}$`), `unprefixed matcher skips /${l}`);
    }
  });
});
