import assert from "node:assert/strict";
import { test } from "node:test";

import { termEndLabel } from "@/lib/slots/term-end";

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
