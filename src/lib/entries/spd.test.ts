import assert from "node:assert/strict";
import { test } from "node:test";

import { spdPayload, spdPaymentPayload } from "./spd";

test("registration QR payload is unchanged by the generic helper", () => {
  assert.equal(
    spdPayload(2026, 12, 450),
    "SPD*1.0*ACC:CZ8820100000002700938285*AM:450.00*CC:CZK*MSG:STARTOVNE MCVV PRIHLASKA 12*X-VS:202612",
  );
});

test("generic payload: same account, given VS and message (race office sale, #207)", () => {
  assert.equal(
    spdPaymentPayload({ amount: 550, vs: "2026900001", message: "MCVV PRODEJKA 2026900001" }),
    "SPD*1.0*ACC:CZ8820100000002700938285*AM:550.00*CC:CZK*MSG:MCVV PRODEJKA 2026900001*X-VS:2026900001",
  );
});
