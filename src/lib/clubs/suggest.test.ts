import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  clubNameSimilarity,
  confidenceOf,
  parseClubName,
  suggestClubMerges,
  type ClubUsage,
} from "./suggest";

const usage = (id: string, names: string | string[], starts = 1, years = [2000]): ClubUsage => {
  const list = Array.isArray(names) ? names : [names];
  return {
    id,
    name: list[0],
    names: list.map((name) => ({ name, years })),
    ids: [id],
    years,
    starts,
    firstYear: years[0],
    lastYear: years.at(-1)!,
  };
};

describe("parseClubName", () => {
  it("splits club-type prefixes and expands abbreviations", () => {
    const p = parseClubName("TJ Loko Č. Třebová");
    assert.deepEqual([...p.prefixes], ["tj"]);
    assert.deepEqual([...p.core].sort(), ["ceska", "lokomotiva", "trebova"]);
    assert.equal(p.expanded, true);
    assert.deepEqual([...parseClubName("K.O.B. Choceň").prefixes], ["kob"]);
    assert.deepEqual([...parseClubName("OK99 Hradec Králové").core].sort(), [
      "99",
      "hradec",
      "kralove",
    ]);
  });
});

describe("clubNameSimilarity", () => {
  it("same club written differently scores high", () => {
    assert.equal(clubNameSimilarity("OK99 Hradec Králové", "OK 99 HK").score, 1);
    assert.equal(clubNameSimilarity("Loko OB Pardubice", "OB Lokomotiva Pardubice").score, 1);
    assert.ok(clubNameSimilarity("OK Lokomotiva Pardubice", "Lokomotiva Pardubice").score >= 0.75);
  });

  it("different club types in one town score low", () => {
    const { score, reasons } = clubNameSimilarity("K.O.B. Choceň", "AC Choceň");
    assert.ok(score < 0.65, String(score));
    assert.ok(reasons.includes("prefix_conflict"));
  });

  it("confidence bands", () => {
    assert.equal(confidenceOf(0.95), "high");
    assert.equal(confidenceOf(0.8), "medium");
    assert.equal(confidenceOf(0.66), "low");
  });
});

describe("suggestClubMerges", () => {
  const clubs = [
    usage("LPU", ["OK Lokomotiva Pardubice", "Loko OB Pardubice"], 900),
    usage("275", "Lokomotiva Pardubice", 150),
    usage("CHC", "K.O.B. Choceň", 950, [2017, 2018]),
    usage("216", "KOB Choceń", 30, [2018, 2019]),
    usage("ACH", "AC Choceň", 277),
    usage("ICT", "Iscarex Česká Třebová", 116),
    usage("348", "Iscarex Č.Třebová", 1),
  ];

  it("suggests pairs of different ids only, larger club first, best first", () => {
    const suggestions = suggestClubMerges(clubs);
    const pairs = suggestions.map((s) => `${s.a.id} ⇄ ${s.b.id}`);
    assert.ok(pairs.includes("ICT ⇄ 348"));
    assert.ok(pairs.includes("LPU ⇄ 275"));
    assert.ok(pairs.includes("CHC ⇄ 216"));
    assert.ok(!pairs.some((pair) => pair.includes("ACH")));
    for (let i = 1; i < suggestions.length; i += 1) {
      assert.ok(suggestions[i - 1].score >= suggestions[i].score);
    }
  });

  it("names of one id (rename) are never a suggestion; best pair of names wins", () => {
    const suggestions = suggestClubMerges(clubs);
    assert.ok(!suggestions.some((s) => s.a.id === s.b.id));
    const loko = suggestions.find((s) => s.a.id === "LPU" && s.b.id === "275");
    assert.ok(loko);
    assert.equal(
      loko.score,
      clubNameSimilarity("OK Lokomotiva Pardubice", "Lokomotiva Pardubice").score,
    );
  });

  it("same normalized name under two ids is high, with the editions both ids exist in", () => {
    const kob = suggestClubMerges(clubs).find((s) => s.a.id === "CHC" && s.b.id === "216");
    assert.ok(kob);
    assert.equal(kob.confidence, "high");
    assert.deepEqual(kob.matched, ["K.O.B. Choceň", "KOB Choceń"]);
    assert.deepEqual(kob.sameYears, [2018]);
  });

  it("skips rejected pairs (order independent ids)", () => {
    const rejected = new Set(["348|ICT"]);
    const withoutRejected = suggestClubMerges(clubs, { rejected });
    assert.ok(!withoutRejected.some((s) => s.a.id === "ICT"));
  });
});
