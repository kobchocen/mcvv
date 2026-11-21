import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  normalizeMoment,
  parseFlag,
  parseHttpUrl,
  siteSettingsFromRows,
  startlistDrawConfirmed,
  splitMoment,
} from "./site-core";

describe("site settings", () => {
  it("parses flags", () => {
    for (const v of ["1", "true", "on", " YES "]) assert.equal(parseFlag(v), true, v);
    for (const v of ["", "0", "false", null, undefined, "nope"]) assert.equal(parseFlag(v), false);
  });

  it("accepts only absolute http(s) URLs", () => {
    assert.deepEqual(parseHttpUrl(""), { ok: true, value: null });
    assert.deepEqual(parseHttpUrl("   "), { ok: true, value: null });
    assert.deepEqual(parseHttpUrl(" https://vysledky.example.cz/mcvv "), {
      ok: true,
      value: "https://vysledky.example.cz/mcvv",
    });
    assert.deepEqual(parseHttpUrl("http://example.org"), {
      ok: true,
      value: "http://example.org/",
    });
    for (const bad of [
      "javascript:alert(1)",
      "ftp://example.org",
      "example.org",
      "/vysledky",
      "https://user:pw@example.org",
      `https://example.org/${"a".repeat(600)}`,
    ]) {
      assert.deepEqual(parseHttpUrl(bad), { ok: false }, bad);
    }
  });

  it("normalizes and splits the stats moment", () => {
    assert.equal(normalizeMoment("  a  \r\nb\r\n\r\n"), "a\nb");
    assert.equal(splitMoment(""), null);
    assert.equal(splitMoment("  \n "), null);
    assert.deepEqual(splitMoment("Titulek\nText řádek 1\nřádek 2"), {
      headline: "Titulek",
      body: "Text řádek 1\nřádek 2",
    });
    assert.deepEqual(splitMoment("Jen titulek"), { headline: "Jen titulek", body: "" });
  });

  it("builds settings from rows, ignoring an invalid stored URL", () => {
    assert.deepEqual(siteSettingsFromRows([]), {
      startlistPublished: false,
      startlistDrawnYear: null,
      onlineResultsUrl: null,
      statsMoment: "",
    });
    assert.deepEqual(
      siteSettingsFromRows([
        { key: "startlist_published", text: "1" },
        { key: "startlist_drawn_year", text: "2026" },
        { key: "online_results_url", text: "javascript:alert(1)" },
        { key: "stats.moment", text: " Moment " },
      ]),
      {
        startlistPublished: true,
        startlistDrawnYear: 2026,
        onlineResultsUrl: null,
        statsMoment: "Moment",
      },
    );
    assert.equal(
      siteSettingsFromRows([{ key: "startlist_drawn_year", text: "abc" }]).startlistDrawnYear,
      null,
    );
  });

  it("draw confirmed: drawn year, or the legacy published flag; hiding keeps the draw", () => {
    const hidden = { startlistPublished: false, startlistDrawnYear: 2026 };
    assert.equal(startlistDrawConfirmed(hidden, 2026), true);
    assert.equal(startlistDrawConfirmed(hidden, 2027), false);
    assert.equal(
      startlistDrawConfirmed({ startlistPublished: true, startlistDrawnYear: null }, 2026),
      true,
    );
    assert.equal(
      startlistDrawConfirmed({ startlistPublished: false, startlistDrawnYear: null }, 2026),
      false,
    );
  });
});
