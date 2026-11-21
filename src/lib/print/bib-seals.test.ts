import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { sealSvg } from "./bib-seals";
import { bibAppearance, twoDigitCount } from "./bibs-core";
import type { CoursePoint } from "./course-profile";

const profile: CoursePoint[] = [
  [0, 0.2],
  [0.5, 0.8],
  [1, 0.3],
];

describe("bib seals", () => {
  it("puts a two-digit count and STARTŮ / VÝHER into the SVG", () => {
    const veteran = bibAppearance({ isDefender: false, winCount: null, veteranStarts: 5 }).seals[0];
    const winner = bibAppearance({ isDefender: false, winCount: 3, veteranStarts: null }).seals[0];
    assert.ok(veteran);
    assert.ok(winner);
    const veteranSvg = sealSvg(veteran, profile, "data:font/ttf;base64,AA==");
    const winnerSvg = sealSvg(winner, profile, "data:font/ttf;base64,AA==");
    assert.equal(twoDigitCount(5), "05");
    assert.match(veteranSvg, />05</);
    assert.match(veteranSvg, />STARTŮ</);
    assert.match(winnerSvg, />03</);
    assert.match(winnerSvg, />VÝHER</);
    assert.match(winnerSvg, />MCVV</);
  });
});
