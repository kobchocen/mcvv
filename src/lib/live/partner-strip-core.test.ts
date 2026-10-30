import assert from "node:assert/strict";
import { test } from "node:test";

import {
  stripDesktopGroups,
  stripIsEmpty,
  stripMobileSequence,
  stripPartners,
  stripTilesFit,
  STRIP_TILE_W,
} from "./partner-strip-core";
import { fillGroups, type BoardPartner } from "./resultboard-core";

const bp = (n: number, opts: { general?: number; noLogo?: number[]; noHref?: number[] } = {}) =>
  Array.from({ length: n }, (_, i): BoardPartner => ({
    id: i + 1,
    name: `P${i + 1}`,
    category: 1,
    logoSrc: opts.noLogo?.includes(i + 1) ? null : `/partners/p${i + 1}.png`,
    href: opts.noHref?.includes(i + 1) ? null : `https://p${i + 1}.example`,
    general: i + 1 === opts.general,
  }));
const names = (xs: { name: string }[]) => xs.map((x) => x.name).join(",");

test("fillGroups: poslední skupina doplněná od začátku, bez opakování v jedné skupině", () => {
  assert.deepEqual(fillGroups([1, 2, 3, 4, 5, 6, 7], 3), [
    [1, 2, 3],
    [4, 5, 6],
    [7, 1, 2],
  ]);
  assert.deepEqual(fillGroups([1, 2, 3, 4, 5, 6], 3), [
    [1, 2, 3],
    [4, 5, 6],
  ]);
  // vše se vejde → jedna skupina, nic se nedoplňuje ani neopakuje
  assert.deepEqual(fillGroups([1, 2], 5), [[1, 2]]);
  assert.deepEqual(fillGroups([], 5), []);
  assert.deepEqual(fillGroups([1, 2, 3], 0), [[1], [2], [3]]);
  for (const g of fillGroups(
    Array.from({ length: 23 }, (_, i) => i),
    7,
  )) {
    assert.equal(g.length, 7);
    assert.equal(new Set(g).size, 7);
  }
});

test("stripPartners: jen s logem, generální zvlášť, href zachován", () => {
  const s = stripPartners(bp(5, { general: 3, noLogo: [2], noHref: [4] }));
  assert.equal(s.general?.name, "P3");
  assert.equal(names(s.rest), "P1,P4,P5");
  assert.equal(s.rest[1].href, null);
  // generální bez loga se nepočítá
  const t = stripPartners(bp(3, { general: 1, noLogo: [1] }));
  assert.equal(t.general, null);
  assert.equal(names(t.rest), "P2,P3");
  assert.equal(stripIsEmpty(stripPartners([])), true);
  assert.equal(stripIsEmpty(stripPartners(bp(2, { noLogo: [1, 2] }))), true);
});

test("stripMobileSequence: generální jako každé třetí logo", () => {
  const seq = (n: number, general?: number) =>
    names(stripMobileSequence(stripPartners(bp(n, { general }))));
  // P7 = generální
  assert.equal(seq(7, 7), "P1,P2,P7,P3,P4,P7,P5,P6,P7");
  // lichý počet běžných: končí generálním
  assert.equal(seq(6, 6), "P1,P2,P6,P3,P4,P6,P5,P6");
  // bez generálního jen běžní
  assert.equal(seq(3), "P1,P2,P3");
  // jen generální → jedno statické logo
  assert.equal(seq(1, 1), "P1");
  // jeden běžný + generální
  assert.equal(seq(2, 2), "P1,P2");
  assert.deepEqual(stripMobileSequence(stripPartners([])), []);
});

test("stripTilesFit + stripDesktopGroups: plná lišta podle šířky", () => {
  assert.equal(stripTilesFit(0), 1);
  assert.equal(stripTilesFit(STRIP_TILE_W), 1);
  assert.equal(stripTilesFit(STRIP_TILE_W * 7 + 8 * 6), 7);
  assert.equal(stripTilesFit(STRIP_TILE_W * 7 + 8 * 6 - 1), 6);
  const { rest } = stripPartners(bp(20));
  const groups = stripDesktopGroups(rest, 7);
  assert.deepEqual(
    groups.map((g) => g.length),
    [7, 7, 7],
  );
  assert.equal(names(groups[2]), "P15,P16,P17,P18,P19,P20,P1");
  assert.deepEqual(stripDesktopGroups([], 7), []);
  assert.equal(stripDesktopGroups(rest.slice(0, 3), 7).length, 1);
});
