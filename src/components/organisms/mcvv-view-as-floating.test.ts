import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "node:test";

import { McvvViewAsFloatingBar } from "./mcvv-admin-view-as";
import { VIEW_AS_ROUTE } from "@/lib/admin/view-as-core";
import { viewAsFloatingSpacePx } from "@/lib/admin/view-as-bar";

const props = {
  locale: "cs",
  title: "Náhled jako: Resultboard",
  readOnly: "Jen čtení",
  stop: "Ukončit náhled",
};

test("floating preview bar posts intent=stop to the view-as route", () => {
  const html = renderToStaticMarkup(createElement(McvvViewAsFloatingBar, props));
  assert.ok(html.includes(`action="${VIEW_AS_ROUTE}"`));
  assert.ok(html.includes('name="intent" value="stop"'));
  assert.ok(html.includes('name="locale" value="cs"'));
  assert.ok(html.includes("Ukončit náhled"));
  assert.ok(html.includes("Náhled jako: Resultboard"));
});

test("floating preview bar does not shift the page or TV layout and never prints", () => {
  const html = renderToStaticMarkup(createElement(McvvViewAsFloatingBar, props));
  assert.match(html, /class="fixed /);
  assert.ok(html.includes("print:hidden"));
  assert.ok(!html.includes("sticky"));
});

test("preview exit is mounted where the preview redirects to (resultboard, entries)", () => {
  for (const dir of ["resultboard", "prihlasky"]) {
    const src = readFileSync(`src/app/[locale]/${dir}/layout.tsx`, "utf8");
    assert.ok(src.includes("<McvvViewAsOutsideAdmin"), dir);
  }
  // Admin layout přesměrovává účty bez rozcestníku právě na tyto dvě cesty.
  const admin = readFileSync("src/app/[locale]/admin/layout.tsx", "utf8");
  assert.ok(admin.includes('"/resultboard"') && admin.includes('"/prihlasky"'));
});

test("the bar renders only during an active admin preview", () => {
  const src = readFileSync("src/components/organisms/mcvv-view-as-outside-admin.tsx", "utf8");
  assert.ok(src.includes("viewAsBarCopy(access.preview"));
  const copy = readFileSync("src/lib/admin/view-as-bar.ts", "utf8");
  assert.match(copy, /if \(!preview\) return null;/);
});

test("entries layout reserves a viewport inset under the floating preview bar, resultboard does not", () => {
  const entries = readFileSync("src/app/[locale]/prihlasky/layout.tsx", "utf8");
  assert.ok(entries.includes("reserveSpace"));
  assert.match(entries, /<McvvViewAsOutsideAdmin[^>]*reserveSpace[\s\S]*\{children\}/);
  const outside = readFileSync("src/components/organisms/mcvv-view-as-outside-admin.tsx", "utf8");
  assert.ok(outside.includes("McvvViewAsFloatingReserve"));
  assert.ok(outside.includes("{children}"));
  const reserve = readFileSync(
    "src/components/organisms/mcvv-view-as-floating-reserve.tsx",
    "utf8",
  );
  assert.ok(reserve.includes("h-dvh"));
  assert.ok(reserve.includes("view-as-preview-shell"));
  assert.ok(reserve.includes("scrollPaddingBottom") || reserve.includes("scroll-pb-"));
  const resultboard = readFileSync("src/app/[locale]/resultboard/layout.tsx", "utf8");
  assert.ok(!resultboard.includes("reserveSpace"));
});

test("preview bar space is the bar height plus its bottom offset", () => {
  assert.equal(viewAsFloatingSpacePx(88, 12), 100);
  assert.equal(viewAsFloatingSpacePx(56.4, 12), 69);
  assert.equal(viewAsFloatingSpacePx(0, 0), 0);
  assert.equal(viewAsFloatingSpacePx(-8, 12), 12);
});
