import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  clubIdFromSlug,
  clubIdSlug,
  clubKey,
  clubSlug,
  createClubResolver,
  isNoClub,
  mostCommonSpelling,
  normalizeClubName,
  type ClubNameRow,
} from "./core";

/** Real cases from the legacy data (cis_klub). */
const NAMES: ClubNameRow[] = [
  { id: "CHC", year: 2017, name: "K.O.B. Choceň" },
  { id: "CHC", year: 2018, name: "K.O.B. Choceň" },
  { id: "216", year: 2018, name: "KOB Choceń" },
  { id: "216", year: 2019, name: "KOB Choceń" },
  { id: "TYN", year: 1998, name: "Týniště nad Orlicí" },
  { id: "TYN", year: 2011, name: "OOB SK Týniště nad Orlicí" },
  { id: "STO", year: 2002, name: "SK Týniště nad Orlicí" },
  { id: "000", year: 2026, name: "" },
  { id: "XXX", year: 2010, name: "-" },
];

describe("club names", () => {
  it("comparison key ignores case, diacritics and punctuation", () => {
    assert.equal(normalizeClubName("K.O.B. Choceň"), "kobchocen");
    assert.equal(normalizeClubName(" kob  CHOCEN "), "kobchocen");
    assert.equal(normalizeClubName(null), "");
  });

  it("slug of a name", () => {
    assert.equal(clubSlug("OK 99 Hradec Králové"), "ok-99-hradec-kralove");
    assert.equal(clubSlug("  --  "), "");
  });

  it("placeholders are no club", () => {
    for (const name of ["", " ", "-", "Neregistrovaný", "bez klubu", null]) {
      assert.equal(isNoClub(name), true, String(name));
    }
    assert.equal(isNoClub("AC Choceň"), false);
  });

  it("most common spelling, ties alphabetical", () => {
    assert.equal(
      mostCommonSpelling(
        new Map([
          ["b", 2],
          ["a", 2],
          ["c", 1],
        ]),
      ),
      "a",
    );
    assert.equal(mostCommonSpelling(new Map()), "");
  });
});

describe("club ids and slugs", () => {
  it("id is the identity: slug = id + newest name, id parsed back", () => {
    assert.equal(clubKey(" chc "), "CHC");
    assert.equal(clubIdSlug("CHC", "K.O.B. Choceň"), "chc-k-o-b-chocen");
    assert.equal(clubIdSlug("216", ""), "216");
    assert.equal(clubIdFromSlug("chc-k-o-b-chocen"), "CHC");
    assert.equal(clubIdFromSlug("1000-novy-klub"), "1000");
    assert.equal(clubIdFromSlug("216"), "216");
  });
});

describe("createClubResolver", () => {
  it("a renamed club stays one club (same id), each edition keeps its name", () => {
    const clubs = createClubResolver({ names: NAMES });
    const old = clubs.resolve("TYN", 1998, "Týniště nad Orlicí");
    const recent = clubs.resolve("TYN", 2011, "OOB SK Týniště nad Orlicí");
    assert.equal(old?.mainId, "TYN");
    assert.equal(recent?.mainId, "TYN");
    assert.equal(old?.name, "Týniště nad Orlicí");
    assert.equal(old?.slug, "tyn-oob-sk-tyniste-nad-orlici");
    assert.equal(clubs.profileName("TYN"), "OOB SK Týniště nad Orlicí");
  });

  it("the same name under different ids is NOT merged without a manual merge", () => {
    const clubs = createClubResolver({ names: NAMES });
    assert.equal(clubs.resolve("STO", 2002, "SK Týniště nad Orlicí")?.mainId, "STO");
    assert.equal(clubs.resolve("216", 2018, "KOB Choceń")?.mainId, "216");
    assert.equal(clubs.display("216", 2018, "KOB Choceń"), "KOB Choceń");
  });

  it("placeholder ids / names are no club", () => {
    const clubs = createClubResolver({ names: NAMES });
    assert.equal(clubs.resolve("000", 2026, ""), null);
    assert.equal(clubs.resolve("XXX", 2010, "-"), null);
    assert.equal(clubs.resolve("", 2010, "Něco"), null);
    assert.equal(clubs.display("000", 2026, ""), "—");
  });

  it("merged id counts under the main id; same edition shows the main id's name", () => {
    const clubs = createClubResolver({
      names: NAMES,
      merges: [{ clubId: "216", mainClubId: "CHC" }],
    });
    // 2018: both ids exist → name of the main id in that edition
    const both = clubs.resolve("216", 2018, "KOB Choceń");
    assert.deepEqual(both, { mainId: "CHC", slug: "chc-k-o-b-chocen", name: "K.O.B. Choceň" });
    // 2019: only the merged id exists → its own name of that edition, still under CHC
    const own = clubs.resolve("216", 2019, "KOB Choceń");
    assert.equal(own?.mainId, "CHC");
    assert.equal(own?.name, "KOB Choceń");
    assert.deepEqual(clubs.members("CHC"), ["CHC", "216"]);
    assert.equal(clubs.mainId("chc"), "CHC");
  });

  it("history of an id, newest first, without placeholders", () => {
    const clubs = createClubResolver({ names: NAMES });
    assert.deepEqual(clubs.history("TYN"), [
      { year: 2011, name: "OOB SK Týniště nad Orlicí" },
      { year: 1998, name: "Týniště nad Orlicí" },
    ]);
    assert.deepEqual(clubs.history("XXX"), []);
  });
});
