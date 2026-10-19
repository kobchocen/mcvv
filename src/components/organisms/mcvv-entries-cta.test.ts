import assert from "node:assert/strict";
import { test } from "node:test";
import { createTranslator } from "next-intl";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import cs from "../../i18n/locales/cs/common.json";
import en from "../../i18n/locales/en/common.json";
import { McvvEntriesCtaContent } from "./mcvv-entries-cta";

test("entries button shows a count badge instead of the arrow", () => {
  const html = renderToStaticMarkup(
    createElement(McvvEntriesCtaContent, { label: "Přihlášky", count: 8 }),
  );
  assert.match(html, /^Přihlášky<span data-slot="entries-count"[^>]*tabular-nums[^>]*>8<\/span>$/);
  assert.ok(!html.includes("lucide-arrow-right"));
});

test("3-digit counts grow into a pill: same height, min-width = height, no wrapping", () => {
  const html = renderToStaticMarkup(
    createElement(McvvEntriesCtaContent, { label: "Přihlášky", count: 258 }),
  );
  const badge = /<span data-slot="entries-count" class="([^"]+)"[^>]*>258<\/span>/.exec(html);
  assert.ok(badge, html);
  const cls = badge[1].split(" ");
  for (const c of [
    "h-6",
    "min-w-6",
    "px-1.5",
    "rounded-full",
    "tabular-nums",
    "whitespace-nowrap",
    "shrink-0",
  ]) {
    assert.ok(cls.includes(c), c);
  }
  assert.ok(!cls.some((c) => /^w-\d/.test(c)), "no fixed width");
});

test("entries button keeps the arrow when the count is 0 or unavailable", () => {
  for (const count of [0, null, undefined]) {
    const html = renderToStaticMarkup(
      createElement(McvvEntriesCtaContent, { label: "Přihlášky", count }),
    );
    assert.ok(html.includes("lucide-arrow-right"), String(count));
    assert.ok(!html.includes("entries-count"), String(count));
  }
});

test("accessible label uses correct plural forms (cs, en)", () => {
  const t = createTranslator({ locale: "cs", messages: cs, namespace: "Home.hero" });
  const cta = cs.Home.hero.primaryCta;
  assert.equal(t("enrolledAria", { cta, count: 1 }), "Přihlášky – přihlášen 1 běžec");
  assert.equal(t("enrolledAria", { cta, count: 3 }), "Přihlášky – přihlášeni 3 běžci");
  assert.equal(t("enrolledAria", { cta, count: 8 }), "Přihlášky – přihlášeno 8 běžců");
  assert.equal(t("enrolledAria", { cta, count: 258 }), "Přihlášky – přihlášeno 258 běžců");
  const te = createTranslator({ locale: "en", messages: en, namespace: "Home.hero" });
  const ctaEn = en.Home.hero.primaryCta;
  assert.equal(te("enrolledAria", { cta: ctaEn, count: 1 }), "Entries – 1 runner entered");
  assert.equal(te("enrolledAria", { cta: ctaEn, count: 8 }), "Entries – 8 runners entered");
});

test("the separate 'registered runners' line is gone", () => {
  assert.ok(!("enrolled" in cs.Home.hero));
  assert.ok(!("enrolled" in en.Home.hero));
});
