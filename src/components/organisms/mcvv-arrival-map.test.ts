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
  // Same row structure as the items above: flex, gap-3, text-base, size-5 icon.
  assert.match(
    html,
    /<button type="button" class="group flex [^"]*items-center gap-3 [^"]*text-base font-medium/,
  );
  assert.match(html, /lucide-map size-5 shrink-0/);
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
});

test("section 03 travel distances (P1 400 m, P2 800 m, train and bus 1,8 km) with nbsp", () => {
  const [car, train, bus] = cs.Home.schedule.travel.map((t) => t.description);
  assert.match(car, /^Parkování P1 /);
  assert.match(car, /odtud 400\u00a0m pěšky\./);
  assert.ok(!car.includes("cca"));
  assert.match(
    car,
    /Alternativa P2: nábřeží Krále Jiřího, po zelené značce 800\u00a0m k\u00a0Verandě\.$/,
  );
  assert.match(train, /celkem 1,8\u00a0km\.$/);
  assert.match(bus, /dál jako z\u00a0vlaku, celkem 1,8\u00a0km\.$/);
  const [carEn, trainEn, busEn] = en.Home.schedule.travel.map((t) => t.description);
  assert.match(carEn, /then 400\u00a0m on foot\./);
  assert.ok(!carEn.includes("approx"));
  assert.match(
    carEn,
    /Alternative P2: Krále Jiřího embankment, green waymark 800\u00a0m to Veranda\.$/,
  );
  assert.match(trainEn, /1\.8\u00a0km in total\.$/);
  assert.match(busEn, /same as from the train, 1\.8\u00a0km in total\.$/);
});

test("arrival map copy exists in both locales", () => {
  assert.equal(en.Home.schedule.arrivalMap.linkLabel, "Arrival & parking map");
  for (const locale of [cs, en]) {
    const map = locale.Home.schedule.arrivalMap;
    assert.ok(map.mapAlt && map.closeLabel && map.attribution);
    assert.deepEqual(Object.keys(map.labels).sort(), ["bus", "p1", "p2", "train", "veranda"]);
  }
});
