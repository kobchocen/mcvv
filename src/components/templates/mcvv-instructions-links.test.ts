import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  CourseMapLink,
  GPS_HREFS,
  InstructionText,
  instructionParts,
} from "./mcvv-instructions-links";

test("Pokyny GPS coordinates open the documented Mapy.com point", () => {
  const html = renderToStaticMarkup(
    createElement(InstructionText, {
      text: `A ${Object.keys(GPS_HREFS).join(" / ")} B`,
    }),
  );
  for (const [label, href] of Object.entries(GPS_HREFS)) {
    assert.deepEqual(instructionParts(label), [{ text: label, href }]);
    assert.ok(html.includes(`href="${href.replaceAll("&", "&amp;")}"`), href);
  }
  assert.equal(html.match(/target="_blank"/g)?.length, 3);
  assert.equal(html.match(/rel="noopener noreferrer"/g)?.length, 3);
  assert.equal(html.includes("mapy.cz"), false);
});

test("course map link points at the existing route SVG", () => {
  const html = renderToStaticMarkup(createElement(CourseMapLink, { label: "Mapa tratě" }));
  assert.match(html, /href="\/images\/mcvv-trasa\.svg"/);
  assert.match(html, /target="_blank"/);
  assert.match(html, /rel="noopener noreferrer"/);
  assert.match(html, />Mapa tratě</);
});
