import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  checkOnsiteBib,
  ONSITE_PAYMENT_AUTHOR,
  ONSITE_SALE_LINE_LABEL,
  onsiteSaleLineName,
  parseOnsiteEntryInput,
} from "./onsite-core";

const valid = {
  firstName: " Jan ",
  lastName: "Novák",
  birthYear: "1985",
  sex: "M",
  categoryId: "A",
  clubName: "K.O.B. Choceň",
  nationality: "cz",
  bib: "123",
  email: "",
};

describe("parseOnsiteEntryInput", () => {
  it("accepts a complete form and normalises values", () => {
    const parsed = parseOnsiteEntryInput(valid);
    assert.equal(parsed.ok, true);
    if (!parsed.ok) return;
    assert.equal(parsed.data.firstName, "Jan");
    assert.equal(parsed.data.birthYear, 1985);
    assert.equal(parsed.data.nationality, "CZ");
    assert.equal(parsed.data.bib, 123);
    assert.equal(parsed.data.email, "");
  });
  it("accepts an optional valid e-mail", () => {
    const parsed = parseOnsiteEntryInput({ ...valid, email: "bezec@example.cz" });
    assert.equal(parsed.ok, true);
  });
  it("reports the first invalid field", () => {
    assert.deepEqual(parseOnsiteEntryInput({ ...valid, bib: "" }), {
      ok: false,
      error: "invalid",
      field: "bib",
    });
    assert.deepEqual(parseOnsiteEntryInput({ ...valid, bib: "0" }), {
      ok: false,
      error: "invalid",
      field: "bib",
    });
    assert.deepEqual(parseOnsiteEntryInput({ ...valid, bib: "12a" }), {
      ok: false,
      error: "invalid",
      field: "bib",
    });
    assert.deepEqual(parseOnsiteEntryInput({ ...valid, sex: "" }), {
      ok: false,
      error: "invalid",
      field: "sex",
    });
    assert.deepEqual(parseOnsiteEntryInput({ ...valid, nationality: "XX" }), {
      ok: false,
      error: "invalid",
      field: "nationality",
    });
    assert.deepEqual(parseOnsiteEntryInput({ ...valid, email: "nope" }), {
      ok: false,
      error: "invalid",
      field: "email",
    });
    assert.deepEqual(parseOnsiteEntryInput({ ...valid, lastName: "  " }), {
      ok: false,
      error: "invalid",
      field: "name",
    });
  });
});

describe("checkOnsiteBib", () => {
  const range = { bibFrom: 100, bibTo: 199 };
  it("accepts a free number inside the category range", () => {
    assert.deepEqual(checkOnsiteBib(150, new Set([149, 151]), [1, 2], range), {
      ok: true,
      outsideCategory: false,
    });
  });
  it("accepts a free number outside the range but flags it", () => {
    assert.deepEqual(checkOnsiteBib(250, new Set(), [], range), {
      ok: true,
      outsideCategory: true,
    });
    assert.deepEqual(checkOnsiteBib(250, new Set(), [], null), {
      ok: true,
      outsideCategory: true,
    });
  });
  it("rejects a taken number", () => {
    assert.deepEqual(checkOnsiteBib(150, new Set([150]), [], range), {
      ok: false,
      error: "bib_taken",
    });
  });
  it("rejects a defending champion's number", () => {
    assert.deepEqual(checkOnsiteBib(1, new Set(), [1, null], range), {
      ok: false,
      error: "bib_champion",
    });
  });
});

describe("onsiteSaleLineName", () => {
  it("contains runner, category and bib", () => {
    assert.equal(
      onsiteSaleLineName(ONSITE_SALE_LINE_LABEL, "Novák  Jan", "M", 123),
      "Dohláška na místě – Novák Jan, M, č. 123",
    );
  });
  it("never exceeds 80 characters", () => {
    const name = onsiteSaleLineName(ONSITE_SALE_LINE_LABEL, "X".repeat(200), "Veteráni 60", 9999);
    assert.ok(name.length <= 80, `${name.length}`);
    assert.ok(name.endsWith(", Veteráni 60, č. 9999"));
  });
});

describe("ONSITE_PAYMENT_AUTHOR", () => {
  it("fits mcvv_platba.autor VARCHAR(8)", () => {
    assert.ok(ONSITE_PAYMENT_AUTHOR.length <= 8);
  });
});
