import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { INSTRUCTION_SECTION_ORDER } from "@/components/templates/mcvv-instructions-content";

type Section = { title: string; paragraphs: string[]; items: string[] };
type Instructions = {
  title: string;
  sections: Record<string, Section>;
};

function load(locale: string): Instructions {
  const url = new URL(`./locales/${locale}/common.json`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8")).Instructions as Instructions;
}

function visible(section: Section): string {
  return [section.title, ...section.paragraphs, ...section.items]
    .join("\n")
    .replaceAll("\u00a0", " ");
}

const csExpected: Record<string, string> = {
  organizer: "Pořadatel\nK.O.B. Choceň",
  race: "Závod\nLesní kros Malá cena Velké Verandy",
  date: "Datum\nneděle 6. 12. 2026",
  place: 'Místo\nChoceň - "Velká Veranda", 49°59\'45"N, 16°12\'10"E.',
  parking: [
    "Parkování",
    "Parkoviště 1 - V zatáčce silnice 315 z Chocně do Srubů (49°59'36.018\"N, 16°12'15.656\"E), kapacita parkoviště je omezená, dodržujte prosím pokyny pořadatele, pokud přijíždíte přes Choceň využijte Parkoviště č. 2.",
    "Parkoviště 2 - V Chocni, na Nábřeží krále Jiřího (49°59'40.238\"N, 16°12'45.698\"E), parkování není organizováno, respektujte dopravní předpisy.",
    "Mapka s vyznačenými parkovišti je na mapě centra závodu (CZ).",
  ].join("\n"),
  distances: [
    "Vzdálenosti",
    "Centrum závodu - Parkoviště 1: 400 m",
    "Centrum závodu - Parkoviště 2: 800 m",
    "Centrum závodu - nádraží ČD: 1,8 km",
    "Centrum závodu - start: 0 m",
    "Centrum závodu - cíl: 0 m",
  ].join("\n"),
  office: [
    "Závodní kancelář",
    'Rozdělena na dvě "přepážky":',
    "Přihlášení závodníci se zaplaceným startovným - vyzvednutí startovního čísla kdykoliv do Vašeho startu.",
    "Nové přihlášky - za vyšší startovné a pouze do 9:45.",
  ].join("\n"),
  bib: "Startovní číslo\nStartovní číslo se svým jménem (pouze pro předem přihlášené) a startovním časem obdržíte v závodní kanceláři. Bez startovního čísla nebudete připuštěni na start. Číslo noste viditelně na prsou. V opačném případě můžete být diskvalifikováni. Traťoví rozhodčí na trati Vás totiž nemusí identifikovat a tím pádem Vám bude chybět průchod kontrolním stanovištěm!",
  start:
    "Start\nIntervalový ve dvojicích po 15 sekundách. Na start se dostavte včas! Minimálně 3 minuty před svým startovním časem. Každý závodník je sám zodpovědný za to, že se včas dostaví na start. Čas závodu se měří od startovního času vyznačeného na startovním čísle. Oficiálním časem závodu je středoevropský čas (CET).",
  course:
    "Trať\n4 300m po lesních cestách a pěšinách (400m asfalt), kopcovitý profil (převýšení 200m), značeno červenými fáborky, trať je shodná pro všechny kategorie.",
  refreshments:
    "Občerstvení\nTeplý nápoj po závodě. Stánkový prodej občerstvení s tradičním sortimentem.",
  facilities:
    "Šatny, WC\nK dispozici pouze nouzové přístřešky (stany) v centru závodu - omezené množství, mobilní WC v centru závodu.",
  medical:
    "Zdravotní služba\nZdravotník v centru závodu. Nejbližší nemocnice Ústí nad Orlicí nebo Litomyšl.",
  awards:
    "Vyhlášení výsledků\nFinanční odměny za 1. - 5. místo v kategoriích muži a ženy (3 000 Kč, 2 000 Kč, 1 000 Kč, 500 Kč, 200 Kč) a za 1. - 3. místo v kategoriích veteránských (500 Kč, 300 Kč, 200 Kč). Věcné odměny pro nejlepší tři v žákovských a dorosteneckých kategoriích.",
  timetable: [
    "Harmonogram",
    "9:00 - otevření závodní kanceláře",
    "9:45 - konec příjmu nových přihlášek",
    "10:15 - start prvních závodníků",
    "11:55 - start posledního závodníka",
    "12:15 - doběh posledního závodníka",
    "12:20 — vyhlášení výsledků a tombola",
  ].join("\n"),
  privacy:
    "Ochrana osobních údajů, filmování a fotografování\nPřihlášením se na tento závod každý účastník souhlasí se zveřejněním svých osobních údajů v rozsahu přihlášky na závod a to v podobě seznamu přihlášených, startovní listiny a výsledkové listiny na webu závodu a v centru závodu. V průběhu akce budou pořizovány zpravodajské fotografie a videa (včetně použití bezpilotního dronu) sloužící k informování veřejnosti o proběhlém závodě, propagaci závodu či vyúčtování dotací na akci atd. v souladu s platnou legislativou. Dále zde mohou být pořizovány fotografie k osobní potřebě účastníků závodu (jako vzpomínka na závody, pro propagaci sportovních klubu, atp.) zejména z vyhlašování výsledků a z tratě závodu. V případě, že nesouhlasíte s fotografováním či filmováním, oznamte to explicitně fotografovi/kameramanovi.",
  notice: [
    "Upozornění",
    "Provozování prodejní nebo propagační činnosti (vyjma propagace sportovních akcí) je možné pouze se souhlasem ředitele závodu.",
    "Závod svým charakterem není vhodný pro děti mladší šesti let. Do výsledkové listiny bude zařazen pouze závodník absolvující celou trať bez pomoci jiné osoby.",
  ].join("\n"),
  spectators:
    "Pro diváky\nSledovat závodníky a vytvořit jim svým povzbuzováním patřičnou atmosféru můžete jak v cílové aréně (zde máte k dispozici občerstvení, výsledkový servis či hlášení mezičasů) tak samozřejmě i na trati. Zde doporučujeme pokračovat po lesní silničce (Formanka) vedoucí na Verandu od Parkoviště č.1 dále SZ směrem asi 400m na kopec, kde se dáte doprava na lesní cestu a po necelých 100m narazíte na trať závodu. Zde máte kromě setrvání možnost pokračovat dále až na vrchol Sutiny (1. kopec - ti nejrychlejší jsou zde asi za 90s od startu) nebo případně se dát po trati vlevo (v protisměru) a dojít až na Hřebínek, vršek posledního čtvrtého kopce (ti nejrychlejší jsou zde asi za 13 minut po startu). Při pohybování po trati dbejte prosím pozor na probíhající závod a nechte závodníkům dostatek prostoru.",
};

test("cs instructions keep the agreed wording", () => {
  const instructions = load("cs");
  assert.equal(instructions.title, "Pokyny");
  assert.deepEqual(Object.keys(instructions.sections), [...INSTRUCTION_SECTION_ORDER]);
  for (const id of INSTRUCTION_SECTION_ORDER) {
    assert.equal(visible(instructions.sections[id]), csExpected[id], id);
  }
});

const alignedFacts: Record<string, { distances: string[]; ceremony: string }> = {
  cs: {
    distances: ["400 m", "800 m", "1,8 km"],
    ceremony: "12:20 — vyhlášení výsledků a tombola",
  },
  en: {
    distances: ["400 m", "800 m", "1.8 km"],
    ceremony: "12:20 — awards ceremony and raffle",
  },
  de: {
    distances: ["400 m", "800 m", "1,8 km"],
    ceremony: "12:20 — Siegerehrung und Tombola",
  },
  pl: {
    distances: ["400 m", "800 m", "1,8 km"],
    ceremony: "12:20 — ogłoszenie wyników i loteria fantowa",
  },
  uk: {
    distances: ["400 м", "800 м", "1,8 км"],
    ceremony: "12:20 — нагородження й лотерея",
  },
};

for (const locale of ["cs", "en", "de", "pl", "uk"]) {
  test(`${locale} instructions use the published distances and 12:20 ceremony`, () => {
    const instructions = load(locale);
    const distances = visible({
      title: "",
      paragraphs: [],
      items: instructions.sections.distances.items,
    });
    const timetable = visible({
      title: "",
      paragraphs: [],
      items: instructions.sections.timetable.items,
    });
    for (const fact of alignedFacts[locale].distances) {
      assert.equal(distances.includes(fact), true, fact);
    }
    assert.equal(timetable.includes(alignedFacts[locale].ceremony), true);
    assert.equal(timetable.includes("12:40"), false);
  });

  test(`${locale} instructions do not add links, covid rules, a fee table or timing claims`, () => {
    const instructions = load(locale);
    const text = INSTRUCTION_SECTION_ORDER.map((id) => visible(instructions.sections[id])).join(
      "\n",
    );
    assert.equal(text.includes("http"), false);
    assert.equal(text.includes("<a"), false);
    assert.equal(/covid|prezentac|brzk|LuM|\bOBD\b|ceník|price list/i.test(text), false);
    assert.equal(Object.keys(instructions.sections).includes("fees"), false);
  });
}
