import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import { profilePoints, type CoursePoint } from "./course-profile";

const pts = JSON.parse(
  readFileSync(path.join(process.cwd(), "src/assets/print/course-profile.json"), "utf8"),
) as CoursePoint[];

describe("course profile", () => {
  it("maps the real track into the bib number band", () => {
    const line = profilePoints(pts, 30, 772, 932, 590, 1890, 5);
    assert.equal(line[0]?.x, 590);
    assert.equal(line.at(-1)?.x, 1890);
    assert.ok(line.length > 50);
    for (const point of line) {
      assert.ok(point.y >= 772 - 1e-6 && point.y <= 932 + 1e-6);
    }
  });
});
