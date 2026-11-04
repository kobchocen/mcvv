/**
 * Message files of all web locales stay in sync (#273).
 *
 * - cs and en are complete and have identical key sets.
 * - de, pl and uk contain exactly the public namespaces, with exactly the keys of en there;
 *   everything else falls back to en (see messages.ts).
 * - Every translated string keeps the ICU arguments, select keys and rich-text tags of en,
 *   so a translation can never break a page at runtime.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import routingConfig from "@/next-intl.config";

import { FALLBACK_LOCALE, PARTIAL_LOCALES, loadMessages } from "./messages";

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

/** Namespaces of the public web that de/pl/uk translate. */
export const PUBLIC_NAMESPACES = [
  "Home",
  "Program",
  "Contact",
  "Instructions",
  "ResultsCurrent",
  "StartList",
  "Entrants",
  "Entries",
  "PhotoGallery",
  "Runner",
  "Nationality",
  "Club",
  "Clubs",
  "Messages",
  "Auth",
  "Stats",
  "LanguageSwitcher",
  "ThemeToggle",
  "Guide",
  "ResultsArchive",
  "ConfirmDialog",
  "OnlineResults",
  "Leader",
  "Record",
].sort();

function load(locale: string): Record<string, Json> {
  const url = new URL(`./locales/${locale}/common.json`, import.meta.url);
  return JSON.parse(readFileSync(url, "utf8")) as Record<string, Json>;
}

/** Flattens to "a.b.0.c" → string leaves; arrays are indexed so their length must match too. */
function flatten(value: Json, prefix = "", out = new Map<string, string>()): Map<string, string> {
  if (Array.isArray(value)) {
    value.forEach((item, index) => flatten(item, `${prefix}.${index}`, out));
  } else if (value !== null && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      flatten(child, prefix ? `${prefix}.${key}` : key, out);
    }
  } else {
    out.set(prefix, String(value));
  }
  return out;
}

/**
 * Structural signature of an ICU message: argument names, select keys and rich-text tags.
 * Plural/ordinal/number formatting is language-specific (pl and uk need `few`/`many`, cs writes
 * ordinals as "{n}."), so only the argument name counts there, plus a required `other`.
 */
export function icuShape(message: string): string[] {
  const shape = new Set<string>();
  let i = 0;

  const tags = (text: string) => {
    for (const m of text.matchAll(/<\/?([A-Za-z][\w-]*)\s*\/?>/g)) shape.add(`tag:${m[0]}`);
  };

  const readText = (stopAtClose: boolean): void => {
    let text = "";
    while (i < message.length) {
      const ch = message[i];
      if (ch === "{") {
        tags(text);
        text = "";
        readArgument();
        continue;
      }
      if (ch === "}" && stopAtClose) break;
      text += ch;
      i += 1;
    }
    tags(text);
  };

  const readArgument = (): void => {
    i += 1; // {
    const head = /^\s*([\w]+)\s*(?:,\s*(\w+)\s*)?(,|\})/.exec(message.slice(i));
    if (!head) {
      shape.add(`invalid@${i}`);
      i = message.length;
      return;
    }
    const [whole, name, type, end] = head;
    i += whole.length;
    if (end === "}") {
      shape.add(`arg:${name}`);
      return;
    }
    if (type === "plural" || type === "select" || type === "selectordinal") {
      const keys: string[] = [];
      for (;;) {
        const option = /^\s*(offset:\d+\s*)?(=?[\w]+)\s*\{/.exec(message.slice(i));
        if (!option) break;
        keys.push(option[2]);
        i += option[0].length;
        readText(true);
        i += 1; // }
      }
      const close = /^\s*\}/.exec(message.slice(i));
      if (!close) shape.add(`unclosed:${name}`);
      else i += close[0].length;
      if (type === "select") shape.add(`arg:${name}:select:${[...keys].sort().join("|")}`);
      else {
        shape.add(`arg:${name}`);
        if (!keys.includes("other")) shape.add(`missing-other:${name}`);
      }
      return;
    }
    // number/date/time with a style: skip to the closing brace.
    const close = message.indexOf("}", i);
    shape.add(`arg:${name}`);
    i = close === -1 ? message.length : close + 1;
  };

  readText(false);
  return [...shape].sort();
}

const en = load("en");
const cs = load("cs");
const enFlat = flatten(en);

describe("web locales", () => {
  it("routing lists cs, en, de, pl and uk with Czech as default", () => {
    assert.deepEqual([...routingConfig.locales], ["cs", "en", "de", "pl", "uk"]);
    assert.equal(routingConfig.defaultLocale, "cs");
    assert.deepEqual([...PARTIAL_LOCALES], ["de", "pl", "uk"]);
    assert.equal(FALLBACK_LOCALE, "en");
  });

  it("cs and en have identical keys and compatible ICU shapes", () => {
    const csFlat = flatten(cs);
    assert.deepEqual([...csFlat.keys()].sort(), [...enFlat.keys()].sort());
    for (const [key, value] of enFlat) {
      const enShape = icuShape(value);
      // Czech may use extra arguments only for grammar (gender {sex, select, …}, agreement
      // {count, plural, …}); the callers pass them for both languages.
      const csShape = icuShape(csFlat.get(key) ?? "").filter(
        (part) => !part.startsWith("arg:") || enShape.includes(part),
      );
      assert.deepEqual(csShape, enShape, key);
    }
  });

  it("the ICU shape parser understands plural, select and tags", () => {
    assert.deepEqual(icuShape("{count, plural, one {# runner} other {# <b>runners</b>}}"), [
      "arg:count",
      "tag:</b>",
      "tag:<b>",
    ]);
    assert.deepEqual(icuShape("{sex, select, male {He} female {She} other {{name}}}"), [
      "arg:name",
      "arg:sex:select:female|male|other",
    ]);
    assert.deepEqual(icuShape("{n, plural, one {x}}"), ["arg:n", "missing-other:n"]);
    assert.deepEqual(icuShape("{n, selectordinal, one {#st} other {#th}} edition"), ["arg:n"]);
    assert.deepEqual(icuShape("{n}. Jahrgang"), ["arg:n"]);
  });

  for (const locale of PARTIAL_LOCALES) {
    describe(locale, () => {
      const own = load(locale);
      const ownFlat = flatten(own);

      it("contains exactly the public namespaces", () => {
        assert.deepEqual(Object.keys(own).sort(), PUBLIC_NAMESPACES);
        for (const ns of PUBLIC_NAMESPACES) assert.ok(ns in en, `en has ${ns}`);
      });

      it("has exactly the keys of en in those namespaces", () => {
        const expected = [...enFlat.keys()].filter((key) =>
          PUBLIC_NAMESPACES.includes(key.split(".")[0]),
        );
        assert.deepEqual([...ownFlat.keys()].sort(), expected.sort());
      });

      it("keeps ICU arguments, select keys and rich-text tags of en", () => {
        for (const [key, value] of ownFlat) {
          assert.deepEqual(icuShape(value), icuShape(enFlat.get(key) ?? ""), key);
        }
      });

      it("keeps proper nouns and avoids forbidden wording", () => {
        // Visible text only: ICU argument names such as {slot, select, …} are not shown.
        const all = [...ownFlat.values()].join("\n").replace(/\{\s*\w+\s*[,}]/g, "{");
        assert.ok(all.includes("Malá cena Velké Verandy"));
        assert.ok(all.includes("Choceň"));
        assert.doesNotMatch(all, /\bslots?\b|\bZK\b/i);
      });

      it("loads with en as fallback for everything else", async () => {
        const merged = flatten((await loadMessages(locale)) as Record<string, Json>);
        assert.deepEqual([...merged.keys()].sort(), [...enFlat.keys()].sort());
        for (const [key, value] of ownFlat) assert.equal(merged.get(key), value, key);
      });
    });
  }
});
