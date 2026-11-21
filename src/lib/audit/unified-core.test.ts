import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parseUnifiedFilters,
  unifiedCsv,
  unifiedQuery,
  unifiedStats,
  type UnifiedRow,
} from "./unified-core";

const row = (over: Partial<UnifiedRow>): UnifiedRow => ({
  kind: "split",
  id: 1,
  at: new Date("2026-12-06T09:15:00Z"),
  userId: 1,
  who: "a@x",
  roles: null,
  action: "split.create",
  target: null,
  year: 2026,
  bib: 15,
  entity: "split",
  source: "web",
  outcome: "applied",
  detail: null,
  ...over,
});

describe("unified audit (P9)", () => {
  it("parses and round-trips filters, dropping invalid values", () => {
    const filters = parseUnifiedFilters({
      druh: "split",
      kdo: " pavel ",
      role: "speaker",
      akce: "split; DROP",
      rok: "2026",
      cislo: "015",
      od: "2026-12-06",
      do: "2026-02-30",
      strana: "3",
    });
    assert.equal(filters.kind, "split");
    assert.equal(filters.actor, "pavel");
    assert.equal(filters.action, "");
    assert.equal(filters.bib, 15);
    assert.equal(filters.to, null);
    assert.equal(filters.page, 3);
    assert.deepEqual(unifiedQuery(filters), {
      druh: "split",
      kdo: "pavel",
      role: "speaker",
      rok: "2026",
      cislo: "15",
      od: "2026-12-06",
    });
    assert.equal(parseUnifiedFilters({ druh: "x", rok: "99999" }).kind, null);
  });

  it("stats count per Prague hour, actors and outcomes", () => {
    const stats = unifiedStats([
      row({}),
      row({ id: 2, action: "split.correct", outcome: "conflict" }),
      row({ id: 3, kind: "start", action: "start.mark", who: "b@x" }),
      row({ id: 4, kind: "audit", action: "settings.changed", outcome: null }),
    ]);
    assert.deepEqual(stats.byKind, { audit: 1, split: 2, start: 1 });
    assert.deepEqual(stats.byHour, [{ hour: "2026-12-06 10", split: 2, start: 1 }]);
    assert.equal(stats.corrections, 1);
    assert.equal(stats.conflicts, 1);
    assert.deepEqual(stats.topActors[0], { who: "a@x", count: 3 });
  });

  it("CSV escapes quotes, separators and formula prefixes", () => {
    const csv = unifiedCsv([row({ who: '=cmd"x', detail: "a,b" })]);
    assert.ok(csv.startsWith("\uFEFFkind,id,at"));
    assert.match(csv, /"'=cmd""x"/);
    assert.match(csv, /"a,b"/);
  });
});
