import assert from "node:assert/strict";
import { test } from "node:test";

import { clockLabel, entryDeadlineLabel, samePragueDay, termEndLabel } from "@/lib/slots/term-end";

test("termEndLabel: konec standardních přihlášek (výlučné `to` → 23:59 v Praze)", () => {
  const slot = { to: new Date("2026-12-02T23:00:00Z") }; // čt 3. 12. 00:00 SEČ
  assert.equal(termEndLabel(slot, "cs"), "ve středu 2. 12. ve 23:59");
  assert.equal(termEndLabel(slot, "en"), "on Wednesday 2/12 at 23:59");
});

test("termEndLabel: „v“ / „ve“ podle hodiny", () => {
  assert.equal(
    termEndLabel({ to: new Date("2026-12-05T17:01:00Z") }, "cs"),
    "v sobotu 5. 12. v 18:00",
  );
  assert.equal(
    termEndLabel({ to: new Date("2026-12-03T11:01:00Z") }, "cs"),
    "ve čtvrtek 3. 12. ve 12:00",
  );
  assert.equal(termEndLabel(undefined, "cs"), null);
});

test("termEndLabel exact + clock/day helpers", () => {
  const late = {
    type: "late" as const,
    from: new Date("2026-12-02T23:00:00Z"),
    to: new Date("2026-12-05T17:00:00Z"),
    active: true,
    feeAdult: 300,
    feeYouth: 150,
    payWithinMinutes: 60,
  };
  assert.equal(termEndLabel(late, "cs", true), "v sobotu 5. 12. v 18:00");
  assert.equal(clockLabel(new Date("2026-12-03T12:32:00Z")), "13:32");
  assert.equal(
    samePragueDay(new Date("2026-12-03T22:30:00Z"), new Date("2026-12-04T10:00:00Z")),
    false,
  );
  assert.equal(
    samePragueDay(new Date("2026-12-03T22:30:00Z"), new Date("2026-12-03T00:30:00Z")),
    true,
  );
});

test("entryDeadlineLabel (Q396): pozdní přihláška → konec pozdního termínu z nastavení", () => {
  const slots = [
    { type: "standard" as const, to: new Date("2026-12-02T23:00:00Z") },
    { type: "late" as const, to: new Date("2026-12-05T17:00:00Z") }, // so 5. 12. 18:00 SEČ
  ];
  const deadline = new Date("2026-12-02T12:00:00Z");
  assert.equal(entryDeadlineLabel({ slot: "late", deadline }, slots, "cs"), "5. 12. 2026 18:00");
  assert.match(
    entryDeadlineLabel({ slot: "late", deadline }, slots, "en") ?? "",
    /5 Dec 2026, 18:00/,
  );
  // Jiný konec pozdního termínu v nastavení → jiný text (nic natvrdo).
  const moved = [{ type: "late" as const, to: new Date("2026-12-05T15:30:00Z") }];
  assert.equal(entryDeadlineLabel({ slot: "late", deadline }, moved, "cs"), "5. 12. 2026 16:30");
  // Ostatní přihlášky a pozdní bez nastaveného termínu → běžná uzávěrka (jen datum).
  assert.equal(entryDeadlineLabel({ slot: "standard", deadline }, slots, "cs"), "2. 12. 2026");
  assert.equal(entryDeadlineLabel({ slot: null, deadline }, slots, "cs"), "2. 12. 2026");
  assert.equal(entryDeadlineLabel({ slot: "late", deadline }, [], "cs"), "2. 12. 2026");
  assert.equal(entryDeadlineLabel({ slot: "standard", deadline: null }, slots, "cs"), null);
});
