import assert from "node:assert/strict";
import { test } from "node:test";

import { statsTableColumnClass } from "./table-layout";

test("numeric stats columns stay nowrap, right-aligned and at least 3 digits wide", () => {
  const cell = statsTableColumnClass(2, [2, 3], "cell");
  assert.match(cell, /whitespace-nowrap/);
  assert.match(cell, /tabular-nums/);
  assert.match(cell, /text-right/);
  assert.match(cell, /min-w-\[3\.25rem\]/);
  assert.doesNotMatch(cell, /break-words/);

  const header = statsTableColumnClass(3, [2, 3], "header");
  assert.match(header, /min-w-\[3\.25rem\]/);
  assert.match(header, /text-right/);
});

test("the winning-team column may wrap; the year column does not", () => {
  const year = statsTableColumnClass(0, [2, 3], "cell");
  const team = statsTableColumnClass(1, [2, 3], "cell");
  assert.match(year, /whitespace-nowrap/);
  assert.match(team, /break-words/);
  assert.match(team, /min-w-0/);
});
