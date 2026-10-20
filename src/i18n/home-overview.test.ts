import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

type Messages = {
  Home: {
    hero: { stats: { value: string; label: string }[] };
    overview: { actions: { label: string; href: string }[] };
  };
  StartList: Record<string, string>;
  Instructions: Record<string, string>;
};

function load(locale: "cs" | "en"): Messages {
  const url = new URL(`./locales/${locale}/common.json`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8")) as Messages;
}

const ORDER = [
  "/program",
  "/prihlaseni-zavodnici",
  "/pokyny",
  "/startovka",
  "/vysledky",
  "/kontakt",
];

for (const locale of ["cs", "en"] as const) {
  test(`${locale}: section 01 buttons keep the agreed order with unique hrefs`, () => {
    const { actions } = load(locale).Home.overview;
    assert.deepEqual(
      actions.map((action) => action.href),
      ORDER,
    );
    assert.equal(new Set(actions.map((action) => action.href)).size, actions.length);
  });

  test(`${locale}: start list and instructions have no "back to race notice" link`, () => {
    const messages = load(locale);
    assert.equal(messages.StartList.back, undefined);
    assert.equal(messages.Instructions.back, undefined);
  });
}

test("cs: section 01 labels", () => {
  assert.deepEqual(
    load("cs")
      .Home.overview.actions.map((action) => action.label)
      .slice(0, 5),
    ["Rozpis", "Přihlášky", "Pokyny", "Startovka", "Výsledky"],
  );
});

test("cs: hero stats strip spells out metres", () => {
  const labels = load("cs").Home.hero.stats.map((stat) => stat.label);
  assert.ok(labels.includes("metrů délka tratě"));
  assert.ok(labels.includes("metrů převýšení"));
});
