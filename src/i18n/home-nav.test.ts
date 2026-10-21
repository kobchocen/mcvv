import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

type HomeMessages = {
  Home: {
    nav: { links: { label: string; href: string }[] };
    results: { eyebrow: string; overline?: string; statsLabel: string };
    footer: { columns: { title: string; links: { href: string }[] }[] };
  };
};

function load(locale: "cs" | "en"): HomeMessages {
  const url = new URL(`./locales/${locale}/common.json`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8")) as HomeMessages;
}

const expected = {
  cs: { menu: "Statistiky", eyebrow: "04 — Statistiky", overline: "Výsledky" },
  en: { menu: "Statistics", eyebrow: "04 — Statistics", overline: "Results" },
} as const;

for (const locale of ["cs", "en"] as const) {
  test(`${locale}: main menu "${expected[locale].menu}" opens the statistics page`, () => {
    const { nav } = load(locale).Home;
    const item = nav.links.find((link) => link.href === "/statistiky");
    assert.ok(item, "menu item for /statistiky exists");
    assert.ok(!nav.links.some((link) => link.href === "#results"));
    assert.equal(item.label, expected[locale].menu);
    assert.ok(!nav.links.some((link) => /^(Výsledky|Results)$/.test(link.label)));
  });

  test(`${locale}: homepage section 04 is statistics with a results overline`, () => {
    const { results, footer } = load(locale).Home;
    assert.equal(results.eyebrow, expected[locale].eyebrow);
    assert.equal(results.overline, expected[locale].overline);
    const column = footer.columns.find((col) => col.links.some((l) => l.href === "/results"));
    assert.equal(column?.title, expected[locale].menu);
    assert.ok(
      column?.links.some((l) => l.href === "/statistiky"),
      "footer links /statistiky",
    );
    assert.ok(results.statsLabel.length > 0, "section 04 has the all-statistics button");
  });
}
