import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { auditMetaRow, metaFromTarget } from "./meta-core";

describe("audit meta (P7)", () => {
  it("parses year, bib and entity from targets", () => {
    assert.deepEqual(metaFromTarget("start:2026:15"), { year: 2026, bib: 15, entity: "start" });
    assert.deepEqual(metaFromTarget("split:2026:K1:215"), {
      year: 2026,
      bib: 215,
      entity: "split",
    });
    assert.deepEqual(metaFromTarget("registration:2026/12"), {
      year: 2026,
      entity: "registration",
    });
    assert.deepEqual(metaFromTarget("startlist:2026/19815021"), {
      year: 2026,
      entity: "startlist",
    });
    assert.deepEqual(metaFromTarget("user:12"), { year: null, entity: "user" });
    assert.deepEqual(metaFromTarget("runner:19815021"), { year: null, entity: "runner" });
    assert.deepEqual(metaFromTarget("settings"), { year: null, entity: "settings" });
    assert.deepEqual(metaFromTarget(undefined), {});
  });

  it("explicit values win, entity falls back to the action group", () => {
    const row = auditMetaRow({
      action: "newsletter.started",
      target: undefined,
      meta: { year: 2026 },
      actorRoles: ["entries", "speaker"],
    });
    assert.deepEqual(row, {
      year: 2026,
      bib: null,
      entity: "newsletter",
      source: "web",
      actorRoles: "entries,speaker",
    });
  });

  it("named system actor", () => {
    const row = auditMetaRow({
      action: "entry.cancelled",
      target: "registration:2026/7",
      systemJob: "late-pay-job",
    });
    assert.equal(row.source, "system");
    assert.equal(row.actorRoles, "system:late-pay-job");
    assert.equal(row.year, 2026);
  });

  it("rejects out-of-range numbers for SMALLINT columns", () => {
    const row = auditMetaRow({ action: "x.y", meta: { bib: 99999, year: -1 } });
    assert.equal(row.bib, null);
    assert.equal(row.year, null);
  });
});
