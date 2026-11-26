import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DESKTOP_SPLITS_MIN_WIDTH_PX,
  DESKTOP_SPLITS_QUERY,
  RECENT_LIMIT_DESKTOP_FALLBACK,
  RECENT_LIMIT_DESKTOP_MAX,
  isDesktopSplitsLayout,
  recentVisibleLimit,
} from "./splits-layout";

test("desktop layout starts at 1200 px with a fine pointer, not on tablets", () => {
  assert.equal(DESKTOP_SPLITS_MIN_WIDTH_PX, 1200);
  assert.equal(DESKTOP_SPLITS_QUERY, "(min-width: 1200px) and (pointer: fine)");
  assert.equal(isDesktopSplitsLayout(1199, true), false);
  assert.equal(isDesktopSplitsLayout(1200, true), true);
  assert.equal(isDesktopSplitsLayout(1440, true), true);
  // 10" tablet / iPad landscape, or a laptop-sized touch screen
  assert.equal(isDesktopSplitsLayout(1440, false), false);
  assert.equal(isDesktopSplitsLayout(1024, true), false);
  assert.equal(isDesktopSplitsLayout(1024, false), false);
  assert.equal(isDesktopSplitsLayout(390, false), false);
});

test("recentVisibleLimit fits as many rows as the viewport height allows", () => {
  assert.equal(recentVisibleLimit(560, 56), 10);
  assert.equal(recentVisibleLimit(900, 56), 16);
  assert.equal(recentVisibleLimit(55, 56), 1);
  assert.equal(recentVisibleLimit(0, 56), RECENT_LIMIT_DESKTOP_FALLBACK);
  assert.equal(recentVisibleLimit(800, 0), RECENT_LIMIT_DESKTOP_FALLBACK);
  assert.equal(recentVisibleLimit(-10, 56), RECENT_LIMIT_DESKTOP_FALLBACK);
  assert.equal(recentVisibleLimit(10_000, 56), RECENT_LIMIT_DESKTOP_MAX);
  assert.equal(recentVisibleLimit(200, 56, { min: 3, max: 8 }), 3);
  assert.equal(recentVisibleLimit(800, 56, { min: 3, max: 8 }), 8);
});
