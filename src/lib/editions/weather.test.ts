import assert from "node:assert/strict";
import { test } from "node:test";

import {
  COURSE_TAGS,
  formatCourseTags,
  formatWeatherLine,
  guessWeather,
  parseConversionArgs,
  parseCourseTags,
  parseTemperature,
  parseWeatherKind,
  planWeatherConversion,
  WEATHER_EMOJI,
  WEATHER_KINDS,
  weatherView,
} from "./weather";

const label = (key: string) => `<${key}>`;

test("číselník: každý typ i štítek má emoji, parsování odmítne neznámé", () => {
  for (const k of WEATHER_KINDS) assert.ok(WEATHER_EMOJI[k]);
  assert.equal(parseWeatherKind("overcast"), "overcast");
  assert.equal(parseWeatherKind("hurricane"), null);
  assert.deepEqual(parseCourseTags("snow_cover, mud,xx"), ["mud", "snow_cover"]);
  assert.deepEqual(parseCourseTags(["ice", "ice", "dry"]), ["dry", "ice"]);
  assert.deepEqual(parseCourseTags(null), []);
  assert.equal(formatCourseTags([]), null);
  assert.equal(formatCourseTags(["snow_cover", "mud"]), "mud,snow_cover");
  assert.ok(formatCourseTags([...COURSE_TAGS])!.length <= 120);
});

test("teplota je nepovinná a v rozumném rozsahu", () => {
  assert.equal(parseTemperature(""), null);
  assert.equal(parseTemperature(null), null);
  assert.equal(parseTemperature("-7"), -7);
  assert.equal(parseTemperature("2,6"), 3);
  assert.equal(parseTemperature("99"), null);
  assert.equal(parseTemperature("abc"), null);
});

test("řádek počasí: typ + štítky + teplota, jinak původní text", () => {
  const v = weatherView({ weatherKind: "overcast", courseTags: "mud", temp: 2, weather: "x" });
  assert.equal(formatWeatherLine(v, label), "☁️ <kind.overcast> · 🥾 <tag.mud> · 2 °C");
  assert.equal(formatWeatherLine(v, label, { emoji: false }), "<kind.overcast> · <tag.mud> · 2 °C");
  const legacy = weatherView({
    weatherKind: null,
    courseTags: null,
    temp: null,
    weather: " zataženo ",
  });
  assert.equal(formatWeatherLine(legacy, label), "zataženo");
  assert.equal(formatWeatherLine(weatherView({}), label), "");
  assert.equal(formatWeatherLine(weatherView({ temp: -1 }), label), "-1 °C");
});

test("odhad z původních textů ročníků", () => {
  const cases: [string, string | null, string[], boolean][] = [
    ["zataženo", "overcast", [], false],
    ["trvalé sněžení, 2-4cm čerstvého sněhu", "snow", ["snow_cover"], false],
    ["polojasno, sněhový poprašek", "partly_cloudy", ["snow_dusting"], false],
    ["zataženo, chvílemi drobný déšť", "drizzle", [], false],
    ["zataženo, 5 - 10cm prachového sněhu", "overcast", ["snow_cover"], false],
    ["zataženo, dešťové přeháňky", "showers", [], false],
    ["zataženo, tvrdá trať, sněhový poprašek", "overcast", ["hard", "snow_dusting"], false],
    [
      "zataženo, 15 cm prachového sněhu na blátivé podložce",
      "overcast",
      ["mud", "snow_cover"],
      false,
    ],
    ["jasno, slunečno, místy blátivá trať", "clear", ["mud"], false],
    ["zataženo, blátivo, místy zbytky zmrzlého sněhu", "overcast", ["mud", "snow_patches"], false],
    ["oblačno-polojasno, sněhové přeháňky", "snow_showers", [], true],
    ["zataženo, blátivo, dešťové přeháňky, občasné sluníčko", "showers", ["mud"], true],
    ["vichřice", null, [], true],
  ];
  for (const [text, kind, tags, unclear] of cases) {
    const g = guessWeather(text);
    assert.equal(g.kind, kind, text);
    assert.deepEqual(g.tags, tags, text);
    assert.equal(g.unclear, unclear, `${text}: ${g.reasons.join("; ")}`);
  }
  assert.ok(guessWeather("").unclear);
});

test("plán převodu: zapisuje jen jednoznačné ročníky bez typu", () => {
  const d = (y: number) => new Date(Date.UTC(y, 11, 1));
  const plan = planWeatherConversion([
    { id: 3, date: d(1995), weather: "oblačno-polojasno, sněhové přeháňky", weatherKind: null },
    { id: 1, date: d(1993), weather: "zataženo", weatherKind: null },
    { id: 2, date: d(1994), weather: "zataženo", weatherKind: "clear" },
    { id: 4, date: d(2026), weather: null, weatherKind: null },
  ]);
  assert.deepEqual(
    plan.map((r) => [r.year, r.action]),
    [
      [1993, "set"],
      [1994, "skip_has_kind"],
      [1995, "skip_unclear"],
      [2026, "skip_empty"],
    ],
  );
  assert.deepEqual(parseConversionArgs(["--apply"]), { apply: true, allowRemote: false });
  assert.deepEqual(parseConversionArgs([]), { apply: false, allowRemote: false });
});
