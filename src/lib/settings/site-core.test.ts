import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  normalizeMoment,
  parseFlag,
  parseHttpUrl,
  siteSettingsFromRows,
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
      onlineResultsUrl: null,
      statsMoment: "",
    });
    assert.deepEqual(
      siteSettingsFromRows([
        { key: "startlist_published", text: "1" },
        { key: "online_results_url", text: "javascript:alert(1)" },
        { key: "stats.moment", text: " Moment " },
      ]),
      { startlistPublished: true, onlineResultsUrl: null, statsMoment: "Moment" },
    );
  });
});
