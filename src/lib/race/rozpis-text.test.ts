import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { formatRozpisDeadline, splitRozpisMarkup } from "./rozpis-text";

describe("splitRozpisMarkup", () => {
  it("splits plain text and tagged links", () => {
    assert.deepEqual(splitRozpisMarkup("<online>Online</online> do středy 2. 12. 2026."), [
      { tag: "online", text: "Online" },
      { text: " do středy 2. 12. 2026." },
    ]);
    assert.deepEqual(
      splitRozpisMarkup("<vitezove>Vítězové MCVV</vitezove> a členové <veterani>klubu</veterani>."),
      [
        { tag: "vitezove", text: "Vítězové MCVV" },
        { text: " a členové " },
        { tag: "veterani", text: "klubu" },
        { text: "." },
      ],
    );
  });
  it("keeps text without tags as one segment", () => {
    assert.deepEqual(splitRozpisMarkup("K.O.B. Choceň"), [{ text: "K.O.B. Choceň" }]);
    assert.deepEqual(splitRozpisMarkup(""), []);
  });
});

describe("formatRozpisDeadline", () => {
  const deadline = new Date(Date.UTC(2026, 11, 2));
  it("formats the online deadline like legacy rozpis.php (cs, genitive weekday)", () => {
    assert.equal(formatRozpisDeadline(deadline, "cs", true), "středy 2. 12. 2026");
    assert.equal(formatRozpisDeadline(deadline, "cs", false), "2. 12. 2026");
    assert.equal(
      formatRozpisDeadline(new Date(Date.UTC(2025, 11, 5)), "cs", true),
      "pátku 5. 12. 2025",
    );
    assert.equal(
      formatRozpisDeadline(new Date(Date.UTC(2026, 11, 5)), "cs", true),
      "soboty 5. 12. 2026",
    );
  });
  it("formats the deadline in English", () => {
    assert.equal(formatRozpisDeadline(deadline, "en", true), "Wednesday 2 December 2026");
    assert.equal(formatRozpisDeadline(deadline, "en", false), "2 December 2026");
  });
  it("returns an empty string without a deadline", () => {
    assert.equal(formatRozpisDeadline(null, "cs", true), "");
  });
});
