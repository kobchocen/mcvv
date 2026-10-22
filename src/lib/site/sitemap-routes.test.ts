import assert from "node:assert/strict";
import { test } from "node:test";

import { STAT_SLUGS } from "@/lib/stats/core";

import { SITEMAP_ROUTES } from "./sitemap-routes";

test("sitemap lists the statistics landing page and every statistics subpage", () => {
  assert.ok(SITEMAP_ROUTES.includes("/statistiky"));
  for (const slug of STAT_SLUGS) {
    assert.ok(SITEMAP_ROUTES.includes(`/statistiky/${slug}`), slug);
  }
  assert.ok(SITEMAP_ROUTES.includes(""));
  assert.ok(SITEMAP_ROUTES.includes("/kluby"), "public club list");
  assert.equal(new Set(SITEMAP_ROUTES).size, SITEMAP_ROUTES.length);
});
