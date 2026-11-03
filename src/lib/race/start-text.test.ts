import assert from "node:assert/strict";
import test from "node:test";

import { fillPlaceholders, startTextParams } from "./start-text";

test("start text params follow the edition model", () => {
  assert.deepEqual(startTextParams({ zeroSeconds: 36_900, intervalSeconds: 15 }), {
    startTime: "10:15",
    interval: "15",
    officeOpens: "9:00",
    onsiteUntil: "9:45",
  });
  assert.deepEqual(
    startTextParams(
      { zeroSeconds: 9 * 3600 + 30 * 60, intervalSeconds: 20 },
      { officeOpensS: 8 * 3600 + 30 * 60, onsiteUntilS: 9 * 3600 + 15 * 60 },
    ),
    { startTime: "9:30", interval: "20", officeOpens: "8:30", onsiteUntil: "9:15" },
  );
  assert.equal(startTextParams({ zeroSeconds: 34_230, intervalSeconds: 20 }).startTime, "9:30:30");
});

test("placeholders are filled deeply, unknown keys stay", () => {
  const params = startTextParams({ zeroSeconds: 9 * 3600 + 30 * 60, intervalSeconds: 20 });
  const raw = {
    items: [{ icon: "clock", text: "Intervalový start od {startTime}" }],
    facts: [{ description: "po {interval} s od {startTime}", n: 2 }],
    other: "{year} {missing}",
    flag: true,
  };
  assert.deepEqual(fillPlaceholders(raw, params), {
    items: [{ icon: "clock", text: "Intervalový start od 9:30" }],
    facts: [{ description: "po 20 s od 9:30", n: 2 }],
    other: "{year} {missing}",
    flag: true,
  });
});
