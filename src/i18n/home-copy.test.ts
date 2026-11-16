import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { VENKU_LOCALITY_HREF } from "@/lib/partners/venku";

type HomeCopy = {
  Home: {
    overview: { title: string };
    profile: { title: string };
    partners: {
      venkuLine1: string;
      venkuLine2Prefix: string;
      venkuLogoAria: string;
      organizer: string;
    };
  };
};

function load(locale: string): HomeCopy {
  const url = new URL(`./locales/${locale}/common.json`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8")) as HomeCopy;
}

const OVERVIEW_TITLES: Record<string, string> = {
  cs: "Není to jen běh. Je to výzva.",
  en: "It is not just a run. It is a challenge.",
  de: "Das ist nicht nur ein Lauf. Das ist eine Herausforderung.",
  pl: "To nie jest tylko bieg. To jest wyzwanie.",
  uk: "Це не просто забіг. Це виклик.",
};

const PROFILE_TITLES: Record<string, string> = {
  cs: "Čtyři kopce. Čtyři seběhy. Žádné výmluvy.",
  en: "Four climbs. Four descents. No excuses.",
  de: "Vier Anstiege. Vier Abstiege. Keine Ausreden.",
  pl: "Cztery podbiegi. Cztery zbiegi. Żadnych wymówek.",
  uk: "Чотири підйоми. Чотири спуски. Жодних відмовок.",
};

for (const locale of Object.keys(OVERVIEW_TITLES)) {
  test(`${locale}: overview title uses the “just a run” wording`, () => {
    assert.equal(load(locale).Home.overview.title, OVERVIEW_TITLES[locale]);
  });

  test(`${locale}: profile slogan keeps the original order`, () => {
    assert.equal(load(locale).Home.profile.title, PROFILE_TITLES[locale]);
  });

  test(`${locale}: partners section has the venku.app slogan keys`, () => {
    const { partners } = load(locale).Home;
    assert.ok(partners.venkuLine1);
    assert.ok(partners.venkuLine2Prefix);
    assert.ok(partners.venkuLogoAria);
    assert.ok(partners.organizer);
    assert.match(partners.venkuLogoAria, /venku\.app/);
    assert.match(partners.venkuLogoAria, /Choceň/);
  });
}

test("venku.app slogan logo points at the Choceň locality", () => {
  assert.equal(VENKU_LOCALITY_HREF, "https://www.venku.app/lokalita/chocen/");
});
