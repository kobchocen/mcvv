import assert from "node:assert/strict";
import { test } from "node:test";

import { pastRegistrationKeys } from "./load-core";

test("own registrations from other years, e-mail trimmed and case-insensitive", () => {
  const index = [
    { year: 2026, id: 1, email: "a@b.cz" },
    { year: 2025, id: 3, email: " A@B.cz " },
    { year: 2024, id: 7, email: "c@d.cz" },
    { year: 2023, id: 2, email: null },
    { year: 2022, id: 5, email: "a@b.cz" },
  ];
  assert.deepEqual(pastRegistrationKeys(index, 2026, "a@b.cz"), [
    { year: 2025, id: 3 },
    { year: 2022, id: 5 },
  ]);
});
