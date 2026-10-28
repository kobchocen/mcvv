import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formDataRecord, parseNewRunner } from "./new-runner-schema";

const valid = {
  year: "2026",
  registrationId: "4",
  firstName: " Jana ",
  lastName: "Nováková",
  birthYear: "1983",
  sex: "F",
  categoryId: "F",
  clubName: "K.O.B. Choceň",
};

describe("parseNewRunner", () => {
  it("accepts an optional nationality code (#200)", () => {
    const none = parseNewRunner(valid);
    assert.ok(none.ok);
    assert.equal(none.data.nationality, "");
    const sk = parseNewRunner({ ...valid, nationality: " sk " });
    assert.ok(sk.ok);
    assert.equal(sk.data.nationality, "SK");
    assert.deepEqual(parseNewRunner({ ...valid, nationality: "XX" }), {
      ok: false,
      error: "invalid",
    });
  });

  it("accepts a complete form", () => {
    const parsed = parseNewRunner(valid);
    assert.ok(parsed.ok);
    assert.equal(parsed.data.sex, "F");
    assert.equal(parsed.data.firstName, "Jana");
    assert.equal(parsed.data.birthYear, 1983);
  });

  it("requires an explicit sex (no default)", () => {
    for (const sex of [undefined, "", "X", "m"]) {
      const raw: Record<string, unknown> = { ...valid, sex };
      if (sex === undefined) delete raw.sex;
      assert.deepEqual(parseNewRunner(raw), { ok: false, error: "sex" }, String(sex));
    }
  });

  it("rejects other invalid fields", () => {
    assert.deepEqual(parseNewRunner({ ...valid, firstName: "  " }), {
      ok: false,
      error: "invalid",
    });
    assert.deepEqual(parseNewRunner({ ...valid, birthYear: "abc" }), {
      ok: false,
      error: "invalid",
    });
    assert.deepEqual(parseNewRunner({ ...valid, categoryId: "" }), { ok: false, error: "invalid" });
  });

  it("reads only known fields from FormData", () => {
    const form = new FormData();
    for (const [key, value] of Object.entries(valid)) form.set(key, value);
    form.set("unexpected", "x");
    assert.deepEqual(formDataRecord(form), valid);
  });
});
