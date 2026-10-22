import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { paginate, paginationWindow } from "./pagination";

describe("paginate", () => {
  const items = Array.from({ length: 125 }, (_, index) => index + 1);

  it("slices one page and reports the shown range", () => {
    const page = paginate(items, "2", 50);
    assert.equal(page.page, 2);
    assert.equal(page.pageCount, 3);
    assert.equal(page.items[0], 51);
    assert.deepEqual([page.from, page.to, page.total], [51, 100, 125]);
    assert.deepEqual([paginate(items, 3, 50).from, paginate(items, 3, 50).to], [101, 125]);
  });

  it("invalid or out-of-range pages fall back to the nearest page", () => {
    assert.equal(paginate(items, undefined, 50).page, 1);
    assert.equal(paginate(items, "abc", 50).page, 1);
    assert.equal(paginate(items, "-3", 50).page, 1);
    assert.equal(paginate(items, "99", 50).page, 3);
    const empty = paginate([], "2", 50);
    assert.deepEqual([empty.page, empty.pageCount, empty.from, empty.to], [1, 1, 0, 0]);
  });
});

describe("paginationWindow", () => {
  it("first, last and neighbours of the current page, gaps marked", () => {
    assert.deepEqual(paginationWindow(1, 1), [1]);
    assert.deepEqual(paginationWindow(1, 3), [1, 2, 3]);
    assert.deepEqual(paginationWindow(5, 10), [1, "gap", 4, 5, 6, "gap", 10]);
    assert.deepEqual(paginationWindow(10, 10), [1, "gap", 9, 10]);
  });
});
