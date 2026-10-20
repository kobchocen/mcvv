import assert from "node:assert/strict";
import { test } from "node:test";

import { entryWritable } from "./guard";
import { registrationDeadlineEnd } from "./year";

test("uzávěrka: po uzávěrce nelze zapisovat ani do letošní přihlášky", () => {
  assert.equal(entryWritable({ year: 2026, open: false }, 2026), false);
});

test("uzávěrka: před uzávěrkou jen aktuální ročník", () => {
  assert.equal(entryWritable({ year: 2026, open: true }, 2026), true);
  // Přímý POST s rokem minulé přihlášky (letos otevřeno) – dřív prošel.
  assert.equal(entryWritable({ year: 2026, open: true }, 2025), false);
  // Admin založil ročník 2027 s budoucí uzávěrkou → 2026 už je uzavřený.
  assert.equal(entryWritable({ year: 2027, open: true }, 2026), false);
  assert.equal(entryWritable({ year: 2026, open: true }, null), false);
});

test("uzávěrka: konec dne uzávěrky v pražském čase", () => {
  const end = registrationDeadlineEnd(new Date("2026-11-29T00:00:00.000Z"));
  // 29. 11. 23:59:59 CET = 22:59:59 UTC
  assert.equal(end?.toISOString(), "2026-11-29T22:59:59.000Z");
  assert.equal(registrationDeadlineEnd(null), null);
});
