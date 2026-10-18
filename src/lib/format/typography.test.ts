import assert from "node:assert/strict";
import { test } from "node:test";

import { czTypo, NBSP, nbspUnits, typoForLocale } from "./typography";

const n = (s: string) => s.replaceAll("~", NBSP);

test("number + unit gets nbsp", () => {
  assert.equal(nbspUnits("po 15 s od 10:15."), n("po 15~s od 10:15."));
  assert.equal(nbspUnits("5 km, 100 Kč a 10 %"), n("5~km, 100~Kč a 10~%"));
  assert.equal(nbspUnits("interval {seconds} s"), n("interval {seconds}~s"));
});

test("unit must be a whole word", () => {
  assert.equal(nbspUnits("15 sekund"), "15 sekund");
  assert.equal(nbspUnits("2 mladí"), "2 mladí");
});

test("Czech one-letter words get nbsp", () => {
  assert.equal(czTypo("Start v lese a k cíli"), n("Start v~lese a~k~cíli"));
  assert.equal(czTypo("V Chocni i okolí"), n("V~Chocni i~okolí"));
  assert.equal(czTypo("(s dětmi) „u kostela“"), n("(s~dětmi) „u~kostela“"));
});

test("the Start card text", () => {
  assert.equal(
    czTypo("Intervalový ve dvojicích po 15 s od 10:15."),
    n("Intervalový ve dvojicích po 15~s od 10:15."),
  );
});

test("unit after number is not treated as preposition", () => {
  assert.equal(czTypo("po 15 s od"), n("po 15~s od"));
});

test("does not touch markup, URLs or word endings", () => {
  assert.equal(czTypo('<a href="https://x.cz/a b">'), '<a href="https://x.cz/a b">');
  assert.equal(czTypo("auta jedou"), "auta jedou");
  assert.equal(czTypo("trasa a"), "trasa a");
});

test("idempotent", () => {
  const once = czTypo("v lese 5 km a z kopce");
  assert.equal(czTypo(once), once);
});

test("English gets only number + unit", () => {
  assert.equal(typoForLocale("a 5 km run in 15 s", "en"), n("a 5~km run in 15~s"));
  assert.equal(typoForLocale("a 5 km run", "cs"), n("a~5~km run"));
});
