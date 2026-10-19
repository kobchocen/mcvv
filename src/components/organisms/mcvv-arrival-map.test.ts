import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import cs from "../../i18n/locales/cs/common.json";
import en from "../../i18n/locales/en/common.json";
import type { McvvHomepageContent } from "../templates/mcvv-homepage-content";
import { McvvScheduleSection } from "./mcvv-schedule-section";

const schedule = (locale: typeof cs) => locale.Home.schedule as McvvHomepageContent["schedule"];

test("arrival map link sits directly below the Velká Veranda pin and opens a dialog", () => {
  const html = renderToStaticMarkup(createElement(McvvScheduleSection, { content: schedule(cs) }));
  const pin = html.indexOf("Choceň - Velká Veranda");
  const link = html.indexOf("Mapa příjezdu a\u00a0parkování");
  const countdown = html.indexOf(cs.Home.schedule.countdownLabel);
  assert.ok(pin > -1 && link > pin && link < countdown, "link between pin and countdown");
  assert.match(html, /<button type="button"[^>]*aria-haspopup="dialog"[^>]*aria-expanded="false"/);
  assert.match(html, /lucide-map/);
});

test("section 03 keeps its original copy (no arrival cards)", () => {
  for (const locale of [cs, en]) {
    const content = schedule(locale);
    assert.equal(content.travel.length, 3);
    assert.ok(!("arrival" in locale.Home.schedule));
    const html = renderToStaticMarkup(createElement(McvvScheduleSection, { content }));
    assert.ok(!html.includes('id="arrival"'));
  }
  assert.match(cs.Home.schedule.travel[0].description, /odtud 300\u00a0m pěšky/);
  assert.match(cs.Home.schedule.travel[1].description, /celkem 2\u00a0km do centra/);
});

test("arrival map copy exists in both locales", () => {
  assert.equal(en.Home.schedule.arrivalMap.linkLabel, "Arrival & parking map");
  for (const locale of [cs, en]) {
    const map = locale.Home.schedule.arrivalMap;
    assert.ok(map.mapAlt && map.closeLabel && map.attribution);
    assert.deepEqual(Object.keys(map.labels).sort(), ["bus", "p1", "p2", "train", "veranda"]);
  }
});
