import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { confettoAt, makeConfetti } from "./confetti-core";

describe("confetti (no library, deterministic)", () => {
  it("same seed → same pieces; cannons optional", () => {
    assert.deepEqual(makeConfetti(800, 600, 50, 7), makeConfetti(800, 600, 50, 7));
    const rain = makeConfetti(800, 600, 40, 7, { cannons: false });
    assert.ok(
      rain.every((p) => p.y0 < 0),
      "without cannons everything falls from the top",
    );
  });
  it("pieces fall down over time", () => {
    const [p] = makeConfetti(800, 600, 1, 3, { cannons: false });
    assert.equal(confettoAt(p, p.t0 - 0.1, 600), null);
    const a = confettoAt(p, p.t0 + 0.5, 600)!;
    const b = confettoAt(p, p.t0 + 2, 600)!;
    assert.ok(b.y > a.y);
  });
});
