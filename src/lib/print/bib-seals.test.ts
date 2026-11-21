import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { sealNumberPlacement, sealSvg } from "./bib-seals";
import { bibAppearance, sealCountText } from "./bibs-core";
import type { CoursePoint } from "./course-profile";

const profile: CoursePoint[] = [
  [0, 0.2],
  [0.5, 0.8],
  [1, 0.3],
];

describe("bib seals", () => {
  it("puts the start count and STARTŮ / VÝHRY into the SVG", () => {
    const veteran = bibAppearance({ isDefender: false, winCount: null, veteranStarts: 5 }).seals[0];
    const winner = bibAppearance({ isDefender: false, winCount: 3, veteranStarts: null }).seals[0];
    assert.ok(veteran);
    assert.ok(winner);
    const veteranSvg = sealSvg(veteran, profile, "data:font/ttf;base64,AA==");
    const winnerSvg = sealSvg(winner, profile, "data:font/ttf;base64,AA==");
    assert.equal(sealCountText(5), "5");
    assert.match(veteranSvg, /id="cut-veteran-5"/);
    assert.match(veteranSvg, />STARTŮ</);
    assert.match(winnerSvg, /id="cut-winner-3"/);
    assert.match(winnerSvg, />VÝHRY</);
    assert.match(winnerSvg, />MCVV</);
    assert.match(veteranSvg, /<path /);
    assert.match(winnerSvg, /stroke-width="4\.75"/);
  });

  it("centres the two-digit count with the official v15 place_number transform", () => {
    const placed = sealNumberPlacement("35");
    assert.ok(Math.abs(placed.tx - 24.2324) < 1e-3);
    assert.ok(Math.abs(placed.yb - 168.948) < 1e-3);
    const cx = (placed.bounds[0] + placed.bounds[2]) / 2;
    const cy = (placed.bounds[1] + placed.bounds[3]) / 2;
    assert.ok(Math.abs(cx - 120) < 0.05, `cx ${cx}`);
    assert.ok(Math.abs(cy - 117.3) < 0.05, `cy ${cy}`);
    const veteran = bibAppearance({ isDefender: false, winCount: null, veteranStarts: 35 })
      .seals[0];
    const svg = sealSvg(veteran!, profile, "data:font/ttf;base64,AA==");
    assert.match(svg, /translate\(24\.232,0\)/);
    assert.match(svg, /stroke-width="4\.75"/);
    assert.match(svg, /<path /);
  });

  it("centres a single-digit count with the official place_number algorithm", () => {
    const placed = sealNumberPlacement("3");
    const cx = (placed.bounds[0] + placed.bounds[2]) / 2;
    const cy = (placed.bounds[1] + placed.bounds[3]) / 2;
    assert.ok(Math.abs(cx - 120) < 0.05, `cx ${cx}`);
    assert.ok(Math.abs(cy - 117.3) < 0.05, `cy ${cy}`);
  });
});
