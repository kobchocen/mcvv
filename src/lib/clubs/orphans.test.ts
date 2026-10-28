import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isOrphanScope,
  orphanAuditDetail,
  orphanFingerprint,
  planOrphanCleanup,
  type ClubRegistryRow,
  validDate,
} from "./orphans";

const row = (id: string, year: number, used: boolean, name = `Klub ${id}`): ClubRegistryRow => ({
  id,
  year,
  name,
  created: null,
  author: null,
  used,
});

const registry: ClubRegistryRow[] = [
  // CHC: data 2024, prázdný rok 2023 a aktuální 2026 bez přihlášky.
  row("CHC", 2023, false),
  row("CHC", 2024, true),
  row("CHC", 2026, false),
  // OLD: nikde žádná vazba → celé id je sirotek.
  row("OLD", 2019, false),
  row("OLD", 2018, false),
  // NEW: jen aktuální ročník bez přihlášky → ponechat.
  row("NEW", 2026, false),
  // MIX: starý sirotek, ale i letošní řádek → celé id nemazat.
  row("MIX", 2020, false),
  row("MIX", 2026, false),
];

describe("planOrphanCleanup", () => {
  it("scope ids removes only ids without any reference and without a current row", () => {
    const plan = planOrphanCleanup(registry, { scope: "ids", currentYear: 2026 });
    assert.deepEqual(
      plan.rows.map((r) => `${r.id}/${r.year}`),
      ["OLD/2018", "OLD/2019"],
    );
    assert.equal(plan.ids, 1);
    assert.equal(plan.removedIds, 1);
    assert.equal(plan.keptCurrent, 3);
  });

  it("scope rows also removes single unreferenced past years", () => {
    const plan = planOrphanCleanup(registry, { scope: "rows", currentYear: 2026 });
    assert.deepEqual(
      plan.rows.map((r) => `${r.id}/${r.year}`),
      ["CHC/2023", "MIX/2020", "OLD/2018", "OLD/2019"],
    );
    assert.equal(plan.ids, 3);
    assert.equal(plan.removedIds, 1);
  });

  it("never touches referenced rows or the current and future years", () => {
    const plan = planOrphanCleanup(registry, { scope: "rows", currentYear: 2026 });
    assert.ok(plan.rows.every((r) => !r.used && r.year < 2026));
  });

  it("fingerprint changes with the list", () => {
    const a = planOrphanCleanup(registry, { scope: "rows", currentYear: 2026 });
    const b = planOrphanCleanup(registry.slice(1), { scope: "rows", currentYear: 2026 });
    assert.notEqual(a.fingerprint, b.fingerprint);
    assert.equal(a.fingerprint, orphanFingerprint(a.rows));
    assert.match(a.fingerprint, /^4-[0-9a-f]{8}$/);
  });

  it("empty registry gives an empty plan", () => {
    const plan = planOrphanCleanup([], { scope: "ids", currentYear: 2026 });
    assert.equal(plan.rows.length, 0);
    assert.equal(plan.fingerprint, orphanFingerprint([]));
  });
});

describe("orphanAuditDetail", () => {
  it("keeps the full rows for a manual restore", () => {
    const plan = planOrphanCleanup(
      [
        {
          ...row("OLD", 2019, false, "TJ Stará"),
          created: new Date("2019-11-01T10:00:00Z"),
          author: "web",
        },
      ],
      { scope: "ids", currentYear: 2026 },
    );
    assert.deepEqual(orphanAuditDetail(plan), {
      version: 1,
      scope: "ids",
      currentYear: 2026,
      count: 1,
      removedIds: 1,
      rows: [
        {
          id: "OLD",
          rok: 2019,
          jmeno: "TJ Stará",
          created: "2019-11-01T10:00:00.000Z",
          autor: "web",
        },
      ],
    });
  });
});

describe("isOrphanScope", () => {
  it("accepts only known scopes", () => {
    assert.ok(isOrphanScope("ids"));
    assert.ok(isOrphanScope("rows"));
    assert.ok(!isOrphanScope("all"));
  });
});

describe("validDate", () => {
  it("treats zero and invalid legacy dates as unknown", () => {
    assert.equal(validDate(new Date(Number.NaN)), null);
    assert.equal(validDate(new Date(0)), null);
    assert.equal(validDate(null), null);
    const ok = new Date("2014-03-01T10:00:00Z");
    assert.equal(validDate(ok), ok);
  });

  it("keeps audit detail serialisable for invalid dates", () => {
    const plan = planOrphanCleanup(
      [{ ...row("ZZZ", 2010, false), created: new Date(Number.NaN) }],
      {
        scope: "ids",
        currentYear: 2026,
      },
    );
    assert.equal(orphanAuditDetail(plan).rows[0]?.created, null);
  });
});
