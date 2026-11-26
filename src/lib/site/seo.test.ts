import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { defaultOgImage, SITE_NAME } from "./seo";

describe("default Open Graph image", () => {
  it("points at the hosted official logo on a forest background", () => {
    const image = defaultOgImage("https://mcvv.org");
    assert.equal(image.url, "https://mcvv.org/images/og/mcvv-og.png");
    assert.equal(image.width, 1200);
    assert.equal(image.height, 630);
    assert.equal(image.alt, SITE_NAME);
    const withSlash = defaultOgImage("https://www.mcvv.org/");
    assert.equal(withSlash.url, "https://www.mcvv.org/images/og/mcvv-og.png");
  });
});
