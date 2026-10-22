import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { audienceFromData, buildAudience, type AudienceData } from "./core";
import {
  NEWSLETTER_YEAR_OPTIONS,
  changedNewsletterFields,
  formatSavedTime,
  snapshotFromForm,
  snapshotFromValues,
} from "./form-state";
import { audienceHintsFromData } from "./hints";

const values = {
  subject: "Pozvánka",
  body: "Ahoj\nsvěte",
  audienceUsers: true,
  audienceYears: 10,
  excludeCurrentEntrants: true,
  banner: "preset:mcvv-2026",
  bannerAlt: "Alt",
  bannerLink: "",
};

function form(entries: Record<string, string | File | undefined>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) {
    if (value !== undefined) data.append(key, value);
  }
  return data;
}

const unchanged = {
  subject: " Pozvánka ",
  body: "Ahoj\r\nsvěte",
  audienceUsers: "on",
  audienceYears: "10",
  excludeCurrentEntrants: "on",
  banner: "preset:mcvv-2026",
  bannerAlt: " Alt ",
  bannerLink: "",
  bannerFile: new File([], ""),
};

describe("newsletter form – unsaved changes", () => {
  it("the saved values and the untouched form are equal (whitespace, CRLF, empty file)", () => {
    assert.deepEqual(
      changedNewsletterFields(snapshotFromForm(form(unchanged)), snapshotFromValues(values)),
      [],
    );
  });

  it("names every changed group: subject, text, banner (select/upload/alt/link), audience", () => {
    const saved = snapshotFromValues(values);
    const changed = (patch: Record<string, string | File | undefined>) =>
      changedNewsletterFields(snapshotFromForm(form({ ...unchanged, ...patch })), saved);
    assert.deepEqual(changed({ subject: "Nový" }), ["předmět"]);
    assert.deepEqual(changed({ body: "Jiný text" }), ["text"]);
    assert.deepEqual(changed({ banner: "" }), ["banner"]);
    assert.deepEqual(changed({ bannerAlt: "Jiný alt" }), ["banner"]);
    assert.deepEqual(changed({ bannerLink: "https://mcvv.org/cs" }), ["banner"]);
    assert.deepEqual(
      changed({ bannerFile: new File([new Uint8Array(10)], "b.png", { type: "image/png" }) }),
      ["banner"],
    );
    assert.deepEqual(changed({ audienceUsers: undefined }), ["publikum"]);
    assert.deepEqual(changed({ audienceYears: "3" }), ["publikum"]);
    assert.deepEqual(changed({ excludeCurrentEntrants: undefined }), ["publikum"]);
    assert.deepEqual(changed({ subject: "X", body: "Y", banner: "" }), [
      "předmět",
      "text",
      "banner",
    ]);
  });

  it("formats the save time as HH:MM in Prague (summer and winter time)", () => {
    assert.equal(formatSavedTime("2026-10-22T15:36:00.000Z"), "17:36");
    assert.equal(formatSavedTime(new Date("2026-12-06T09:05:00.000Z")), "10:05");
  });
});

describe("newsletter audience – one load for the campaign and all form hints", () => {
  const now = new Date("2026-10-22T12:00:00Z");
  const data: AudienceData = {
    userEmails: ["user@a.cz", "Both@a.cz", null],
    legacy: [
      { email: "old@a.cz", year: 2010 },
      { email: "five@a.cz", year: 2022 },
      { email: "both@a.cz", year: 2026 },
      { email: "five@a.cz", year: 2025 },
      { email: "nopromo@a.cz", year: 2025 },
      { email: "entrant@a.cz", year: 2026 },
      { email: "gone@a.cz", year: 2026 },
    ],
    unsubscribed: ["gone@a.cz"],
    noPromotion: ["nopromo@a.cz"],
    currentEntrants: { year: 2026, emails: ["entrant@a.cz", "both@a.cz"] },
  };

  it("gives the same audience as the per-option query did", () => {
    for (const years of NEWSLETTER_YEAR_OPTIONS) {
      for (const users of [true, false]) {
        for (const excludeCurrentEntrants of [true, false]) {
          const options = { users, years, excludeCurrentEntrants };
          const from = now.getFullYear() - Math.max(1, years) + 1;
          const expected = buildAudience(
            {
              userEmails: users ? data.userEmails : [],
              legacyEmails:
                years > 0 ? data.legacy.filter((r) => r.year >= from).map((r) => r.email) : [],
              unsubscribed: data.unsubscribed,
              noPromotion: data.noPromotion,
              currentEntrants: excludeCurrentEntrants ? data.currentEntrants.emails : [],
            },
            options,
          );
          assert.deepEqual(audienceFromData(data, options, now), expected, JSON.stringify(options));
        }
      }
    }
  });

  it("computes the form hints for every year option from the same data", () => {
    const hints = audienceHintsFromData(data, now);
    assert.equal(hints.users, 2);
    assert.deepEqual(hints.years, { 1: 2, 2: 3, 3: 3, 5: 3, 10: 3, 20: 4 });
    assert.deepEqual(hints.currentEntrants, { year: 2026, count: 2 });
  });
});
