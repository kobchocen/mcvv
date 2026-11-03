import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { isStatSlug } from "@/lib/stats/core";

import {
  categoryBirthYearBound,
  FREE_ENTRY_LINKS,
  formatFreeEntryDeadline,
  formatOnlineDeadline,
  formatRaceDayShort,
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

describe("formatOnlineDeadline (Q414)", () => {
  // Standard term ends (exclusive) on Thu 3 Dec 00:00 Prague = 2 Dec 23:00 UTC.
  const end = new Date(Date.UTC(2026, 11, 2, 23, 0));
  it("shows the last minute of online entries with weekday", () => {
    assert.deepEqual(formatOnlineDeadline(end, "cs"), {
      long: "st\u00A02.\u00A012.\u00A02026\u00A023:59",
      short: "st\u00A02.\u00A012.",
    });
    assert.deepEqual(formatOnlineDeadline(end, "en"), {
      long: "Wed\u00A02\u00A0December\u00A02026,\u00A023:59",
      short: "Wed\u00A02\u00A0Dec",
    });
  });
  it("returns null without a standard term", () => {
    assert.equal(formatOnlineDeadline(null, "cs"), null);
  });
});

describe("formatRaceDayShort (Q416)", () => {
  it("formats the race day with weekday", () => {
    const day = new Date(Date.UTC(2026, 11, 6));
    assert.equal(formatRaceDayShort(day, "cs"), "ne\u00A06.\u00A012.");
    assert.equal(formatRaceDayShort(day, "en"), "Sun\u00A06\u00A0Dec");
    assert.equal(formatRaceDayShort(null, "en"), null);
  });
});

describe("Rozpis texts decided by Pavel on 3 Nov (Q414, Q416, start, timetable)", () => {
  type Program = {
    sections: Record<string, Record<string, string>>;
    timetable: Record<string, string>;
  };
  const read = (locale: "cs" | "en") =>
    JSON.parse(readFileSync(`src/i18n/locales/${locale}/common.json`, "utf8")).Program as Program;
  const fill = (text: string | undefined, params: Record<string, string>) =>
    (text ?? "")
      .replace(/\{(\w+)\}/g, (whole, key: string) => params[key] ?? whole)
      .replace(/\u00A0/g, " ");
  const values = {
    cs: {
      onlineUntil: "st 2. 12. 2026 23:59",
      onlineUntilShort: "st 2. 12.",
      raceDay: "ne 6. 12.",
      feeAdult: "200 Kč",
      feeYouth: "100 Kč",
    },
    en: {
      onlineUntil: "Wed 2 December 2026, 23:59",
      onlineUntilShort: "Wed 2 Dec",
      raceDay: "Sun 6 Dec",
      feeAdult: "CZK 200",
      feeYouth: "CZK 100",
    },
  };
  const expected = {
    cs: {
      registrationSummary: "Online do st 2. 12. · na místě do 9:45",
      registrationBody:
        "Online přihlášky do st 2. 12. 2026 23:59. V den závodu (ne 6. 12.) lze podat přihlášku na místě v závodní kanceláři od 9:00 do 9:45 (dospělí 200 Kč, děti a dorost 100 Kč). Online přihláška platí až po připsání platby.",
      startBody: "Startovní interval 15 s od 10:15. Intervalový start ve dvojicích.",
      timetableSummary: "9:00 · 9:45 · 10:15 · 11:55 · 12:20",
      timetableBody:
        "Závodní kancelář se otevírá v 9:00. Přihlášky na místě končí v 9:45. Intervalový start od 10:15. Plánovaný start posledního závodníka v 11:55. Vyhlášení výsledků a tombola ve 12:20.",
      timetable: [
        "9:00 — otevření závodní kanceláře",
        "Do 9:45 — přihlášky na místě",
        "10:15 — start (interval 15 s)",
        "11:55 — plánovaný start posledního závodníka",
        "12:20 — vyhlášení výsledků a tombola",
      ],
    },
    en: {
      registrationSummary: "Online until Wed 2 Dec · on site until 9:45",
      registrationBody:
        "Online registration until Wed 2 December 2026, 23:59. On race day (Sun 6 Dec) you can register on site at the race office from 9:00 until 9:45 (adults CZK 200, youth CZK 100). An online entry is valid only after the payment is received.",
      startBody: "Start interval 15 s from 10:15. Interval start in pairs.",
      timetableSummary: "9:00 · 9:45 · 10:15 · 11:55 · 12:20",
      timetableBody:
        "The race office opens at 9:00. On-site registration closes at 9:45. Interval start from 10:15. Planned start of the last runner at 11:55. Awards and raffle at 12:20.",
      timetable: [
        "9:00 — race office opens",
        "Until 9:45 — on-site registration",
        "10:15 — start (15 s interval)",
        "11:55 — planned start of the last runner",
        "12:20 — awards ceremony and raffle",
      ],
    },
  };
  for (const locale of ["cs", "en"] as const) {
    it(`renders the approved ${locale} wording`, () => {
      const program = read(locale);
      const params = {
        ...values[locale],
        officeOpens: "9:00",
        onsiteUntil: "9:45",
        startTime: "10:15",
        interval: "15",
        seconds: "15",
      };
      const want = expected[locale];
      const { registration, start, timetable } = program.sections as Record<
        string,
        Record<string, string>
      >;
      assert.equal(fill(registration?.summary, params), want.registrationSummary);
      assert.equal(fill(registration?.body, params), want.registrationBody);
      assert.equal(fill(start?.body, params), want.startBody);
      assert.equal(fill(timetable?.summary, params), want.timetableSummary);
      assert.equal(fill(timetable?.body, params), want.timetableBody);
      assert.deepEqual(
        ["office", "registration", "start", "lastStart", "ceremony"].map((key) =>
          fill(program.timetable[key], params),
        ),
        want.timetable,
      );
    });
    it(`keeps a general ${locale} wording without deadline or race day`, () => {
      const { registration } = read(locale).sections as Record<string, Record<string, string>>;
      for (const text of [registration?.summaryOpen, registration?.bodyOpen]) {
        assert.ok(text);
        assert.doesNotMatch(text, /\{(onlineUntil|onlineUntilShort|raceDay)\}/);
      }
    });
  }
});
