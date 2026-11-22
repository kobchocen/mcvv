import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

type HomeNews = {
  Home: {
    news: { eyebrow: string; title: string; body: string; linkLabel: string };
    hero: { primaryCta: string; secondaryCta: string };
  };
};

function load(locale: string): HomeNews {
  const url = new URL(`./locales/${locale}/common.json`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8")) as HomeNews;
}

test("cs: news box uses the approved team-competition wording", () => {
  const { news } = load("cs").Home;
  assert.equal(news.title, "Soutěž týmů");
  assert.equal(news.linkLabel, "Pravidla soutěže týmů");
  assert.match(news.eyebrow, /Novinka \{n\}\. ročníku/);
  assert.match(news.body, /Od letoška bodují vedle jednotlivců i týmy napříč kategoriemi/);
  assert.match(news.body, /Rozhoduje výkon, ne počet lidí v klubu/);
  assert.match(news.body, /Odměna pro vítězný tým/);
  assert.doesNotMatch(news.body, /autocomplete/i);
  assert.doesNotMatch(news.body, /našeptávač/);
  assert.doesNotMatch(news.body, /nesluč|nesjednoc/i);
});

test("cs: hero CTAs stay Přihlášky and Rozpis", () => {
  const { hero } = load("cs").Home;
  assert.equal(hero.primaryCta, "Přihlášky");
  assert.equal(hero.secondaryCta, "Rozpis");
});

for (const locale of ["cs", "en", "de", "pl", "uk"]) {
  test(`${locale}: news box has title, body and rules link, no autocomplete`, () => {
    const { news } = load(locale).Home;
    assert.ok(news.title);
    assert.ok(news.body);
    assert.ok(news.linkLabel);
    assert.match(news.eyebrow, /\{n\b/);
    const blob = `${news.title} ${news.body} ${news.linkLabel} ${news.eyebrow}`;
    assert.doesNotMatch(blob, /autocomplete/i);
  });
}
