import assert from "node:assert/strict";
import { test } from "node:test";

import { filterMergeOptions, type MergePickOption } from "./merge-pick";

const option = (id: string, label: string, search = ""): MergePickOption => ({
  id,
  label,
  meta: "",
  search,
  card: { title: label, lines: [] },
});

const options = [
  option("111", "OK Lokomotiva Pardubice", "Loko Pardubice"),
  option("113", "TJ Sokol Česká Třebová"),
  option("011", "SK Žamberk"),
  option("1110", "AC Pardubice"),
];

test("searches by id first (exact, then prefix) and by name without diacritics", () => {
  assert.deepEqual(
    filterMergeOptions(options, "111").map((o) => o.id),
    ["111", "1110"],
  );
  assert.deepEqual(
    filterMergeOptions(options, "ceska treb").map((o) => o.id),
    ["113"],
  );
  assert.deepEqual(
    filterMergeOptions(options, "zamb").map((o) => o.id),
    ["011"],
  );
});

test("every word must match; older names are searchable; the other side is excluded", () => {
  assert.deepEqual(
    filterMergeOptions(options, "loko pard").map((o) => o.id),
    ["111"],
  );
  assert.deepEqual(
    filterMergeOptions(options, "pardubice", { exclude: "111" }).map((o) => o.id),
    ["1110"],
  );
  assert.deepEqual(filterMergeOptions(options, "  "), []);
});

test("result list is limited", () => {
  const many = Array.from({ length: 50 }, (_, i) => option(String(i), `Klub ${i}`));
  assert.equal(filterMergeOptions(many, "klub").length, 30);
  assert.equal(filterMergeOptions(many, "klub", { limit: 5 }).length, 5);
});
