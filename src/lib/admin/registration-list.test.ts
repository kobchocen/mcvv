import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { entryStatusTone, formatListAmount, paymentDiffTone } from "@/lib/admin/registration-list";
import { formatDate } from "@/lib/format/date";

const NBSP = "\u00a0";

describe("admin entry list formatting", () => {
  it("formats amounts with grouping and currency per locale", () => {
    assert.equal(formatListAmount(0, "cs"), `0${NBSP}Kč`);
    assert.equal(formatListAmount(100, "cs"), `100${NBSP}Kč`);
    assert.equal(formatListAmount(1200, "cs"), `1${NBSP}200${NBSP}Kč`);
    assert.equal(formatListAmount(1200, "en"), `CZK${NBSP}1,200`);
    // de/pl/uk admin screens are Czech.
    assert.equal(formatListAmount(1200, "de"), `1${NBSP}200${NBSP}Kč`);
  });

  it("signs differences with a real minus and an explicit plus", () => {
    assert.equal(formatListAmount(-200, "cs", { signed: true }), `\u2212200${NBSP}Kč`);
    assert.equal(formatListAmount(100, "cs", { signed: true }), `+100${NBSP}Kč`);
    assert.equal(formatListAmount(0, "cs", { signed: true }), `0${NBSP}Kč`);
    assert.equal(formatListAmount(-1500, "en", { signed: true }), `\u2212CZK${NBSP}1,500`);
  });

  it("uses Czech numeric dates in cs and short dates in en", () => {
    const created = new Date("2026-10-18T09:30:00Z");
    assert.equal(formatDate(created, "cs").replace(/\s/g, " "), "18. 10. 2026");
    assert.equal(formatDate(created, "en"), "18 Oct 2026");
  });

  it("maps the payment difference to a tone", () => {
    assert.equal(paymentDiffTone(-1), "short");
    assert.equal(paymentDiffTone(0), "even");
    assert.equal(paymentDiffTone(50), "over");
  });

  it("maps every entry status to a badge tone", () => {
    assert.deepEqual(
      [0, 1, 2, 3, 4, 5, null, 9].map((status) => entryStatusTone(status)),
      ["cancelled", "empty", "unpaid", "paid", "overpaid", "confirmed", "unknown", "unknown"],
    );
  });
});

describe("admin entry list layout", () => {
  const source = readFileSync(
    new URL("../../app/[locale]/admin/prihlasky/page.tsx", import.meta.url),
    "utf8",
  );

  it("does not force a horizontal scrollbar", () => {
    assert.doesNotMatch(source, /min-w-\[68rem\]/);
    assert.doesNotMatch(source, /overflow-x-auto/);
  });

  it("makes the whole row a real link to the entry detail", () => {
    assert.match(source, /data-testid="regs-row-link"/);
    assert.match(source, /after:absolute after:inset-0/);
  });

  it("formats dates through the locale instead of ISO", () => {
    assert.doesNotMatch(source, /dateInputValue\(row\.created\)/);
  });

  it("keeps the registration timeline collapsed by default", () => {
    const timeline = readFileSync(
      new URL("../../components/organisms/mcvv-admin-registration-timeline.tsx", import.meta.url),
      "utf8",
    );
    assert.match(timeline, /<details className=/);
    assert.doesNotMatch(timeline, /<details open/);
  });

  it("shows a short free badge with the full text for hover and screen readers", () => {
    assert.match(source, /copy\("freeAutoConfirmedShort"\)/);
    assert.match(source, /title=\{copy\("freeAutoConfirmed"\)\}/);
    assert.match(source, /aria-label=\{copy\("freeAutoConfirmed"\)\}/);
  });

  it("keeps entry icons on the e-mail line so the name gets the full width", () => {
    const meta = source.indexOf('data-testid="regs-entry-meta"');
    assert.ok(meta > 0);
    assert.ok(source.indexOf("<McvvMessageBubble", meta) > meta);
  });
});
