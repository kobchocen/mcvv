import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ARRIVAL_POINTS,
  formatWalkDistance,
  googleDriveUrl,
  googleWalkUrl,
  mapPosition,
  mapyPointUrl,
  mapyWalkUrl,
  VERANDA,
} from "./points";

test("all arrival points lie inside the static map", () => {
  for (const point of ARRIVAL_POINTS) {
    const { left, top } = mapPosition(point);
    assert.ok(left > 2 && left < 98, `${point.id} left ${left}`);
    assert.ok(top > 2 && top < 98, `${point.id} top ${top}`);
  }
});

test("mapPosition matches the rendered map (Veranda top-left, train bottom-right)", () => {
  assert.deepEqual(mapPosition(VERANDA), { left: 9.61, top: 48.97 });
  const train = ARRIVAL_POINTS.find((p) => p.id === "train")!;
  assert.deepEqual(mapPosition(train), { left: 92, top: 72.7 });
});

test("parking coordinates from issue #75", () => {
  const p1 = ARRIVAL_POINTS.find((p) => p.id === "p1")!;
  const p2 = ARRIVAL_POINTS.find((p) => p.id === "p2")!;
  assert.equal(
    googleDriveUrl(p1),
    "https://www.google.com/maps/dir/?api=1&destination=49.9934183,16.2043828&travelmode=driving",
  );
  assert.equal(
    mapyPointUrl(p2),
    "https://mapy.com/fnc/v1/showmap?center=16.2128564,49.9945672&zoom=17&marker=true",
  );
});

test("walking route links end at Veranda (Mapy.com lon,lat; Google lat,lon)", () => {
  const bus = ARRIVAL_POINTS.find((p) => p.id === "bus")!;
  assert.equal(
    mapyWalkUrl(bus),
    "https://mapy.com/fnc/v1/route?start=16.2229,49.9982&end=16.202778,49.995833&routeType=foot_fast",
  );
  assert.equal(
    googleWalkUrl(bus),
    "https://www.google.com/maps/dir/?api=1&origin=49.9982,16.2229&destination=49.995833,16.202778&travelmode=walking",
  );
});

test("formatWalkDistance uses non-breaking spaces and locale decimals", () => {
  assert.equal(formatWalkDistance(388, "cs"), "390\u00a0m");
  assert.equal(formatWalkDistance(2071, "cs"), "2,1\u00a0km");
  assert.equal(formatWalkDistance(2071, "en"), "2.1\u00a0km");
});
