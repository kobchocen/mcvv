import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { AUDIT_TEXT_MAX, auditValue, diffFields, settingsSnapshot } from "./diff";

describe("auditValue", () => {
  it("normalizes dates, nullish values and long texts", () => {
    assert.equal(auditValue(new Date("2026-12-06T09:00:00Z")), "2026-12-06T09:00:00.000Z");
    assert.equal(auditValue(undefined), null);
    assert.equal(auditValue(0), 0);
    assert.equal(auditValue(false), false);
    const long = auditValue("x".repeat(AUDIT_TEXT_MAX + 10));
    assert.equal(typeof long === "string" && long.length, AUDIT_TEXT_MAX + 1);
  });
});

describe("diffFields", () => {
  it("returns only changed fields with before and after", () => {
    assert.deepEqual(
      diffFields({ amount: 300, date: null, note: "a" }, { amount: 350, date: null, note: "a" }),
      { amount: { before: 300, after: 350 } },
    );
  });

  it("treats dates by value", () => {
    assert.deepEqual(
      diffFields(
        { date: new Date("2026-01-01T00:00:00Z") },
        { date: new Date("2026-01-01T00:00:00Z") },
      ),
      {},
    );
  });

  it("lists filled fields of a new record and skips empty ones", () => {
    assert.deepEqual(diffFields(null, { name: "SK Chocerady", note: null }), {
      name: { before: null, after: "SK Chocerady" },
    });
  });

  it("treats an empty text like a missing value", () => {
    assert.deepEqual(diffFields({ a: "" }, { a: null, b: "" }), {});
  });

  it("reports removed keys", () => {
    assert.deepEqual(diffFields({ a: "1", b: "2" }, { a: "1" }), {
      b: { before: "2", after: null },
    });
  });
});

describe("settingsSnapshot", () => {
  it("maps rows by key", () => {
    assert.deepEqual(settingsSnapshot([{ key: "k", text: "v" }]), { k: "v" });
  });
});
