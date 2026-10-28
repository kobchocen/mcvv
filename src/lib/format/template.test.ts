import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { fillTemplate } from "./template";

describe("fillTemplate", () => {
  it("replaces all known placeholders", () => {
    assert.equal(
      fillTemplate("Opravdu změnit roli uživatele {name} na „{role}“?", {
        name: "Jana",
        role: "Admin",
      }),
      "Opravdu změnit roli uživatele Jana na „Admin“?",
    );
    assert.equal(fillTemplate("{n} + {n}", { n: 2 }), "2 + 2");
  });

  it("keeps unknown placeholders and does not interpret $ patterns", () => {
    assert.equal(fillTemplate("{a} {b}", { a: "$&" }), "$& {b}");
  });
});
