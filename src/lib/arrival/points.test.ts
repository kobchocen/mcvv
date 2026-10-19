import assert from "node:assert/strict";
import { test } from "node:test";

import { ARRIVAL_MAP, ARRIVAL_POINTS, mapPosition, routeSvgPath, VERANDA } from "./points";

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

test("light and dark map variants are both referenced", () => {
  assert.equal(ARRIVAL_MAP.src, "/images/prijezd-mapa.webp");
  assert.equal(ARRIVAL_MAP.srcDark, "/images/prijezd-mapa-dark.webp");
});

test("routes start at their point, end at Veranda and stay inside the map", () => {
  const ids = ["p1", "p2", "train", "bus"] as const;
  const veranda = mapPosition(VERANDA);
  const end = `L${((veranda.left / 100) * 1240).toFixed(1)} ${((veranda.top / 100) * 560).toFixed(1)}`;
  for (const id of ids) {
    const d = routeSvgPath(id);
    const start = mapPosition(ARRIVAL_POINTS.find((p) => p.id === id)!);
    assert.ok(d.startsWith(`M${((start.left / 100) * 1240).toFixed(1)} `), id);
    assert.ok(d.endsWith(end), id);
    for (const [, x, y] of d.matchAll(/[ML](-?[\d.]+) (-?[\d.]+)/g)) {
      assert.ok(+x >= 0 && +x <= 1240 && +y >= 0 && +y <= 560, `${id} ${x},${y}`);
    }
  }
});
