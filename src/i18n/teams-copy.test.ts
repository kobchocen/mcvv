import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

type TeamsCopy = {
  Teams: {
    entryDuty: string;
    prizeWaiver: string;
    historicalNote: string;
    announcement: string;
  };
};

function load(locale: string): TeamsCopy {
  const url = new URL(`./locales/${locale}/common.json`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8")) as TeamsCopy;
}

test("cs: rules use našeptávač, never autocomplete, and the approved prize waiver", () => {
  const { Teams: copy } = load("cs");
  assert.match(copy.entryDuty, /[Pp]oužijte našeptávač názvů/);
  assert.doesNotMatch(copy.entryDuty, /autocomplete/i);
  assert.equal(
    copy.prizeWaiver,
    "K.O.B. Choceň jako pořadatel se v případě vítězství vzdává ceny ve prospěch druhého týmu.",
  );
  assert.equal(
    copy.historicalNote,
    "Propočet podle pravidel soutěže týmů 2026, uplatněný na historickou výsledkovou listinu. Tým je název klubu tak, jak je v listině tohoto roku.",
  );
  assert.match(copy.announcement, /Odměna pro vítězný tým/);
  assert.doesNotMatch(copy.announcement, /sladk/i);
});

for (const locale of ["cs", "en", "de", "pl", "uk"]) {
  test(`${locale}: public team copy never says autocomplete`, () => {
    const raw = readFileSync(new URL(`./locales/${locale}/common.json`, import.meta.url), "utf8");
    const teams = JSON.parse(raw).Teams as Record<string, string>;
    const blob = Object.values(teams).join(" ");
    assert.doesNotMatch(blob, /autocomplete/i);
    assert.doesNotMatch(blob, /nesluč|nesjednoc/i);
  });
}
