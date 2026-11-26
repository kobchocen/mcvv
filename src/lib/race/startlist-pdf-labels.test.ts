import assert from "node:assert/strict";
import { describe, it } from "node:test";

import cs from "@/i18n/locales/cs/common.json";
import de from "@/i18n/locales/de/common.json";
import en from "@/i18n/locales/en/common.json";
import pl from "@/i18n/locales/pl/common.json";
import uk from "@/i18n/locales/uk/common.json";

import { DEFAULT_START_MODEL, startModelFromEdition } from "./start-time";
import { startListPdfLabels, startListPdfModelLine } from "./startlist-pdf-labels";

const now = new Date("2026-11-26T09:51:00Z");

describe("startListPdfModelLine", () => {
  it("adds organisers from 07:45:00 for 2026 in every locale", () => {
    const expected = {
      cs: "Start 1 a 2 souběžně od 10:15:00 · Pořadatelé od 07:45:00 · interval 15 s · 2. start od č. 601",
      en: "Starts 1 and 2 in parallel from 10:15:00 · Organisers from 07:45:00 · interval 15 s · 2nd start from no. 601",
      de: "Start 1 und 2 parallel ab 10:15:00 · Organisatoren ab 07:45:00 · Intervall 15 s · 2. Start ab Nr. 601",
      pl: "Start 1 i 2 równolegle od 10:15:00 · Organizatorzy od 07:45:00 · interwał 15 s · 2. start od nr 601",
      uk: "Старт 1 і 2 паралельно від 10:15:00 · Організатори від 07:45:00 · інтервал 15 с · 2-й старт від № 601",
    };
    const messages = { cs, en, de, pl, uk };
    for (const [locale, line] of Object.entries(expected)) {
      assert.equal(
        startListPdfModelLine(
          messages[locale as keyof typeof messages].StartList,
          DEFAULT_START_MODEL,
          2026,
        ),
        line,
        locale,
      );
    }
  });
  it("keeps the historical header when organisers share the edition zero", () => {
    const past = startModelFromEdition(
      {
        startZeroSeconds: 36900,
        startInterval: 15,
        secondStartFrom: 601,
        organizerZeroSeconds: null,
      },
      2025,
    );
    const line = startListPdfModelLine(cs.StartList, past, 2025);
    assert.equal(line, "Start 1 a 2 souběžně od 10:15:00 · interval 15 s · 2. start od č. 601");
    assert.ok(!line.includes("Pořadatelé"));
  });
  it("puts a custom organiser zero into the 2026 header", () => {
    const model = startModelFromEdition(
      {
        startZeroSeconds: 36900,
        startInterval: 15,
        secondStartFrom: 601,
        organizerZeroSeconds: 8 * 3600,
      },
      2026,
    );
    const line = startListPdfModelLine(cs.StartList, model, 2026);
    assert.match(line, /Pořadatelé od 08:00:00/);
    assert.match(line, /souběžně od 10:15:00/);
  });
});

describe("startListPdfLabels", () => {
  it("includes the organiser zero in the 2026 model line", () => {
    const labels = startListPdfLabels("cs", {
      year: 2026,
      editionNumber: 34,
      raceDate: new Date("2026-12-06T00:00:00Z"),
      model: DEFAULT_START_MODEL,
      count: 3,
      generatedAt: now,
    });
    assert.match(labels.model, /Pořadatelé od 07:45:00/);
    const enLabels = startListPdfLabels("en", {
      year: 2026,
      editionNumber: 34,
      raceDate: new Date("2026-12-06T00:00:00Z"),
      model: DEFAULT_START_MODEL,
      count: 3,
      generatedAt: now,
    });
    assert.match(enLabels.model, /Organisers from 07:45:00/);
  });
});
