import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeClubName } from "./core";
import {
  clubNameSimilarity,
  confidenceOf,
  pairKey,
  parseClubName,
  suggestClubMerges,
  type ClubNameUsage,
} from "./suggest";

const usage = (name: string, starts = 1, canonicalId: number | null = null): ClubNameUsage => ({
  key: normalizeClubName(name),
  name,
  starts,
  firstYear: 2000,
  lastYear: 2010,
  canonicalId,
});

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
  const names = [
    usage("OK Lokomotiva Pardubice", 900),
    usage("Lokomotiva Pardubice", 150),
    usage("Loko OB Pardubice", 49),
    usage("K.O.B. Choceň", 950),
    usage("AC Choceň", 277),
    usage("Iscarex Česká Třebová", 116),
    usage("Iscarex Č.Třebová", 1),
  ];

  it("suggests pairs only, larger club first, best first", () => {
    const suggestions = suggestClubMerges(names);
    const pairs = suggestions.map((s) => `${s.a.name} ⇄ ${s.b.name}`);
    assert.ok(pairs.includes("Iscarex Česká Třebová ⇄ Iscarex Č.Třebová"));
    assert.ok(pairs.includes("OK Lokomotiva Pardubice ⇄ Lokomotiva Pardubice"));
    assert.ok(!pairs.some((pair) => pair.includes("AC Choceň")));
    for (let i = 1; i < suggestions.length; i += 1) {
      assert.ok(suggestions[i - 1].score >= suggestions[i].score);
    }
  });

  it("skips rejected pairs and pairs already in one canonical club", () => {
    const [a, b] = pairKey(
      normalizeClubName("Iscarex Česká Třebová"),
      normalizeClubName("Iscarex Č.Třebová"),
    );
    const rejected = new Set([`${a}|${b}`]);
    const withoutRejected = suggestClubMerges(names, { rejected });
    assert.ok(!withoutRejected.some((s) => s.a.name.startsWith("Iscarex")));

    const merged = names.map((row) =>
      row.name.includes("Lokomotiva") ? { ...row, canonicalId: 1 } : row,
    );
    const pairs = suggestClubMerges(merged).map((s) => `${s.a.name} ⇄ ${s.b.name}`);
    assert.ok(!pairs.includes("OK Lokomotiva Pardubice ⇄ Lokomotiva Pardubice"));
    // A name not merged yet is still suggested against the canonical club's names.
    assert.ok(pairs.some((pair) => pair.includes("Loko OB Pardubice")));
  });
});
