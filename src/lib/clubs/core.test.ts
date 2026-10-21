import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  clubSlug,
  createClubResolver,
  isNoClub,
  mostCommonSpelling,
  normalizeClubName,
} from "./core";

const KOB = { id: 7, slug: "kob-chocen", name: "K.O.B. Choceň" };

describe("club names", () => {
  it("identity key ignores case, diacritics and punctuation", () => {
    assert.equal(normalizeClubName("K.O.B. Choceň"), "kobchocen");
    assert.equal(normalizeClubName(" kob  CHOCEN "), "kobchocen");
    assert.equal(normalizeClubName(null), "");
  });

  it("slug without dashes is the identity key", () => {
    for (const name of ["K.O.B. Choceň", "OK 99 Hradec Králové", "SOOB Spartak Rychnov nad Kn."]) {
      assert.equal(normalizeClubName(clubSlug(name)), normalizeClubName(name));
    }
    assert.equal(clubSlug("OK 99 Hradec Králové"), "ok-99-hradec-kralove");
    assert.equal(clubSlug("  --  "), "");
  });

  it("placeholders are no club", () => {
    for (const name of ["", " ", "-", "Neregistrovaný", "bez klubu", null]) {
      assert.equal(isNoClub(name), true, String(name));
    }
    assert.equal(isNoClub("AC Choceň"), false);
  });

  it("without aliases every name stays as written (no automatic merge)", () => {
    const resolver = createClubResolver();
    assert.equal(resolver.display("KOB Choceň"), "KOB Choceň");
    assert.equal(resolver.display("Lokomotiva Pardubice"), "Lokomotiva Pardubice");
    assert.equal(resolver.display(""), "—");
    assert.deepEqual(resolver.resolve("Lokomotiva Pardubice"), {
      key: "n:lokomotivapardubice",
      slug: "lokomotiva-pardubice",
      canonicalName: null,
      canonicalId: null,
    });
    assert.notEqual(
      resolver.resolve("OK Lokomotiva Pardubice")?.key,
      resolver.resolve("Lokomotiva Pardubice")?.key,
    );
    assert.equal(resolver.resolve("-"), null);
  });

  it("a confirmed alias maps a written name to the canonical club", () => {
    const resolver = createClubResolver([
      { key: "kobchocen", club: KOB },
      { key: "kobchocenzs", club: KOB },
    ]);
    assert.equal(resolver.display("KOB Choceň z.s."), "K.O.B. Choceň");
    assert.equal(resolver.resolve("kob chocen")?.key, "c:7");
    assert.equal(resolver.resolve("KOB Choceň z.s.")?.slug, "kob-chocen");
    assert.equal(resolver.display("AC Choceň"), "AC Choceň");
  });

  it("most common spelling, ties alphabetically", () => {
    assert.equal(
      mostCommonSpelling(
        new Map([
          ["KOB Choceň", 1],
          ["K.O.B. Choceň", 3],
        ]),
      ),
      "K.O.B. Choceň",
    );
    assert.equal(
      mostCommonSpelling(
        new Map([
          ["b", 1],
          ["a", 1],
        ]),
      ),
      "a",
    );
    assert.equal(mostCommonSpelling(new Map()), "");
  });
});
