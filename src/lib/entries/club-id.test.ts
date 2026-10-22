import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CLUB_ID_MAX_LENGTH, nextNumericClubIdFrom, numericClubId } from "./club-id";

describe("nextNumericClubIdFrom", () => {
  it("continues after the highest numeric id, letter ids ignored", () => {
    assert.equal(nextNumericClubIdFrom(["CHC", "PHK", "P10", "000", "216", "645"]), "646");
    assert.equal(nextNumericClubIdFrom(["CHC"]), "111");
    assert.equal(nextNumericClubIdFrom(["000", "050"]), "111");
  });

  it("goes past 999 without wrapping (legacy char(3) restarted at 111)", () => {
    assert.equal(nextNumericClubIdFrom(["111", "999"]), "1000");
    assert.equal(nextNumericClubIdFrom(["1000", "999", "CHC"]), "1001");
  });

  it("fails instead of reusing an id when varchar(8) is exhausted", () => {
    assert.equal(CLUB_ID_MAX_LENGTH, 8);
    assert.equal(nextNumericClubIdFrom(["99999998"]), "99999999");
    assert.throws(() => nextNumericClubIdFrom(["99999999"]));
  });

  it("numeric value only for all-digit ids", () => {
    assert.equal(numericClubId("216"), 216);
    assert.equal(numericClubId(" 1000 "), 1000);
    assert.equal(numericClubId("P10"), null);
    assert.equal(numericClubId("CHC"), null);
  });
});
