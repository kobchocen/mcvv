import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "node:test";

import { RACE_WORDMARK_BOTTOM, RACE_WORDMARK_TOP, RaceBrand } from "./race-brand";

const brand = { top: "MALA CENA", bottom: "VELKE VERANDY", mark: "V" };

test("header lockup: official logo plus Czech two-line wordmark", () => {
  const html = renderToStaticMarkup(createElement(RaceBrand, { ...brand, alt: "" }));
  assert.ok(html.includes("/images/logo/mcvv-logo-hlavicka-svetla.svg"));
  assert.ok(html.includes("/images/logo/mcvv-logo-hlavicka-tmava.svg"));
  assert.equal(RACE_WORDMARK_TOP, "MALÁ CENA");
  assert.equal(RACE_WORDMARK_BOTTOM, "VELKÉ VERANDY");
  assert.ok(html.includes(RACE_WORDMARK_TOP));
  assert.ok(html.includes(RACE_WORDMARK_BOTTOM));
  // Localized ASCII props must not replace the official Czech name.
  assert.ok(!html.includes("MALA CENA"));
  assert.ok(!html.includes("VELKE VERANDY"));
  assert.match(html, /aria-hidden="true"/);
});

test("header wordmark: first line follows text color, second line is orange", () => {
  const html = renderToStaticMarkup(createElement(RaceBrand, brand));
  assert.ok(html.includes("text-foreground"));
  assert.ok(html.includes("dark:text-white"));
  assert.ok(html.includes("text-race-accent"));
  assert.ok(html.includes("font-display"));
});
