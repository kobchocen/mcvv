import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import cs from "../../i18n/locales/cs/common.json";
import de from "../../i18n/locales/de/common.json";
import en from "../../i18n/locales/en/common.json";
import pl from "../../i18n/locales/pl/common.json";
import uk from "../../i18n/locales/uk/common.json";
import { fillCopy, McvvQuickAddView, type QuickAddCopy } from "./mcvv-quick-add-view";

const KEYS = [
  "quickHint",
  "quickHide",
  "quickHiddenNotice",
  "quickUndo",
  "quickHiddenToggle",
  "quickHiddenShow",
  "quickHiddenCollapse",
  "quickRestore",
  "quickRestoreAll",
  "quickAllHidden",
  "quickError",
] as const;

const copy: QuickAddCopy = {
  quickAdd: cs.Entries.quickAdd,
  runnerTitle: cs.Entries.quickAddTitle,
  hint: cs.Entries.quickHint,
  hide: cs.Entries.quickHide,
  hiddenNotice: cs.Entries.quickHiddenNotice,
  undo: cs.Entries.quickUndo,
  hiddenToggle: cs.Entries.quickHiddenToggle,
  hiddenShow: cs.Entries.quickHiddenShow,
  hiddenCollapse: cs.Entries.quickHiddenCollapse,
  restore: cs.Entries.quickRestore,
  restoreAll: cs.Entries.quickRestoreAll,
  allHidden: cs.Entries.quickAllHidden,
  error: cs.Entries.quickError,
};

const noop = () => {};
const base = {
  year: 2026,
  registrationId: null,
  clubName: "K.O.B. Choceň",
  labels: new Map([
    ["19800025", "Komárek Josef (1980)"],
    ["20150002", "Komárek Josef (2015)"],
  ]),
  notice: null,
  error: false,
  showHidden: false,
  copy,
  addAction: noop,
  onHide: noop,
  onUndo: noop,
  onToggleHidden: noop,
  onRestore: noop,
  onRestoreAll: noop,
};
const josef80 = { id: "19800025", name: "Komárek Josef" };
const josef15 = { id: "20150002", name: "Komárek Josef" };
const iva = { id: "19685008", name: "Barcalová Iva", clubId: "CHC", clubName: "K.O.B. Choceň" };

test("quick-hide copy exists in all five locales with the same placeholders", () => {
  for (const [locale, json] of Object.entries({ cs, en, de, pl, uk })) {
    for (const key of KEYS) {
      const value = (json.Entries as Record<string, string>)[key];
      assert.ok(value, `${locale}.Entries.${key}`);
      const placeholders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort().join();
      assert.equal(placeholders(value), placeholders(cs.Entries[key]), `${locale}.${key}`);
    }
  }
  assert.equal(cs.Entries.quickHide, "Už nenabízet {name}");
});

test("each runner chip = add button + cross 'Už nenabízet <name>'; namesakes show the year", () => {
  const html = renderToStaticMarkup(
    createElement(McvvQuickAddView, { ...base, runners: [iva, josef80, josef15], hidden: [] }),
  );
  assert.ok(html.includes(">Rychlá nabídka</h3>"));
  assert.ok(html.includes(cs.Entries.quickHint));
  assert.equal(html.match(/data-slot="quick-hide"/g)?.length, 3);
  assert.ok(html.includes('aria-label="Už nenabízet Barcalová Iva"'));
  assert.ok(html.includes('aria-label="Už nenabízet Komárek Josef (2015)"'));
  assert.ok(html.includes(">Komárek Josef (1980)</button>"));
  assert.ok(html.includes('name="runnerId" value="19685008"'));
  assert.ok(html.includes('name="clubId" value="CHC"'));
  // Bez skrytých běžců není přepínač ani hláška.
  assert.ok(!html.includes("aria-expanded"));
  assert.match(html, /role="status" aria-live="polite" class="text-sm"><\/div>/);
});

test("after hiding: notice with undo; hidden toggle collapsed, then expanded with restore", () => {
  const collapsed = renderToStaticMarkup(
    createElement(McvvQuickAddView, {
      ...base,
      runners: [iva, josef80],
      hidden: [josef15],
      notice: josef15,
    }),
  );
  assert.ok(collapsed.includes("Komárek Josef (2015) se už nebude nabízet."));
  assert.ok(collapsed.includes(">Zpět</button>"));
  assert.ok(collapsed.includes('aria-expanded="false"'));
  assert.ok(collapsed.includes("Skrytí běžci (1)"));
  assert.ok(!collapsed.includes('data-slot="quick-restore"'));

  const expanded = renderToStaticMarkup(
    createElement(McvvQuickAddView, {
      ...base,
      runners: [],
      hidden: [iva, josef15],
      showHidden: true,
    }),
  );
  assert.ok(expanded.includes(cs.Entries.quickAllHidden));
  assert.ok(expanded.includes('aria-expanded="true"'));
  assert.ok(expanded.includes('aria-label="Vrátit do nabídky Komárek Josef (2015)"'));
  assert.equal(expanded.match(/data-slot="quick-restore"/g)?.length, 2);
  assert.ok(expanded.includes("Vrátit všechny"));
  assert.ok(!expanded.includes('data-slot="quick-hide"'));
});

test("error shows an alert; fillCopy keeps unknown placeholders", () => {
  const html = renderToStaticMarkup(
    createElement(McvvQuickAddView, { ...base, runners: [iva], hidden: [], error: true }),
  );
  assert.ok(html.includes(`role="alert"`) && html.includes(cs.Entries.quickError));
  assert.equal(fillCopy("{name} – {x}", { name: "A" }), "A – {x}");
});
