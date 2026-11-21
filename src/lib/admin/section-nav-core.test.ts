import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { activeSection, hashSection, sectionNavItems } from "./section-nav-core";

const items = [
  { id: "den-zavodu", label: "Den závodu" },
  { id: "maily", label: "E-maily" },
  { id: "prodejky", label: "Prodejky" },
];

describe("section navigator (P10)", () => {
  it("keeps only valid unique anchors with labels", () => {
    assert.deepEqual(
      sectionNavItems([
        ...items,
        { id: "maily", label: "Dup" },
        { id: "Bad Id", label: "x" },
        { id: "prazdny", label: " " },
      ]).map((item) => item.id),
      ["den-zavodu", "maily", "prodejky"],
    );
  });

  it("highlights the last heading above the offset line", () => {
    const at = (tops: number[]) =>
      activeSection(
        items.map((item, index) => ({ id: item.id, top: tops[index]! })),
        120,
      );
    assert.equal(at([300, 900, 1500]), "den-zavodu");
    assert.equal(at([-400, 100, 700]), "maily");
    assert.equal(at([-900, -300, 50]), "prodejky");
    assert.equal(
      activeSection(
        [
          { id: "a", top: 10 },
          { id: "b", top: 500 },
        ],
        120,
        true,
      ),
      "b",
    );
    assert.equal(activeSection([]), null);
  });

  it("resolves shareable #anchors only for known sections", () => {
    assert.equal(hashSection("#maily", items), "maily");
    assert.equal(hashSection("#nic", items), null);
    assert.equal(hashSection("", items), null);
  });

  it("pages render the navigator only behind permissions.v2", () => {
    for (const page of ["nastaveni", "platby", "startovka"]) {
      const source = readFileSync(`src/app/[locale]/admin/${page}/page.tsx`, "utf8");
      assert.match(source, /<McvvAdminSectionFrame[\s\S]*?items=\{\s*access\.v2\s*\?/, page);
      assert.match(source, /:\s*null\s*\}/, page);
    }
  });
});
