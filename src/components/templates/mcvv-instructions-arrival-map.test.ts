import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import cs from "../../i18n/locales/cs/common.json";
import en from "../../i18n/locales/en/common.json";
import type { McvvHomepageContent } from "./mcvv-homepage-content";
import { InstructionsArrivalMap } from "./mcvv-instructions-arrival-map";

const arrival = (locale: typeof cs) =>
  (locale.Home.schedule as McvvHomepageContent["schedule"]).arrivalMap;

test("Pokyny arrival map reuses the homepage dialog and label", () => {
  for (const locale of [cs, en]) {
    const content = arrival(locale);
    assert.ok(content, "arrival map copy exists");
    const html = renderToStaticMarkup(createElement(InstructionsArrivalMap, { content }));
    assert.match(html, /data-testid="instructions-arrival-map"/);
    assert.match(html, /<button type="button"[^>]*aria-haspopup="dialog"/);
    assert.ok(
      html
        .replaceAll("\u00a0", " ")
        .includes(content.linkLabel.replaceAll("\u00a0", " ").replaceAll("&", "&amp;")),
      content.linkLabel,
    );
  }
});

test("Pokyny arrival map renders nothing without copy", () => {
  const html = renderToStaticMarkup(createElement(InstructionsArrivalMap, {}));
  assert.equal(html, "");
});

test("arrival map is wired only into the Parkování section and filled by the page", () => {
  const template = readFileSync(
    new URL("./mcvv-instructions-template.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    template,
    /id === "parking" \?\s*\(?\s*<InstructionsArrivalMap content=\{content\.arrivalMap\} \/>\s*\)?\s*: null/,
  );
  assert.equal(template.match(/<InstructionsArrivalMap/g)?.length, 1);
  const page = readFileSync(new URL("../../app/[locale]/pokyny/page.tsx", import.meta.url), "utf8");
  assert.match(page, /arrivalMap: \(home\.raw\("schedule"\)/);
});
