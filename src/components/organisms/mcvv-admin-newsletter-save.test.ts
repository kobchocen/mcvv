import assert from "node:assert/strict";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { McvvSaveStatus, saveButtonState } from "./mcvv-admin-newsletter-save";

test("save button: disabled without changes, enabled on change, disabled while saving", () => {
  assert.deepEqual(saveButtonState({ isNew: false, dirty: false, pending: false }), {
    disabled: true,
    label: "Uložit koncept",
  });
  assert.deepEqual(saveButtonState({ isNew: false, dirty: true, pending: false }), {
    disabled: false,
    label: "Uložit koncept",
  });
  assert.deepEqual(saveButtonState({ isNew: false, dirty: true, pending: true }), {
    disabled: true,
    label: "Ukládám…",
  });
  // Nová kampaň ještě není uložená vůbec → tlačítko je aktivní.
  assert.equal(saveButtonState({ isNew: true, dirty: false, pending: false }).disabled, false);
});

const render = (props: Parameters<typeof McvvSaveStatus>[0]) =>
  renderToStaticMarkup(createElement(McvvSaveStatus, props));

test("pending is announced (spinner and label are on the button)", () => {
  const html = render({ pending: true, feedback: null, dirty: true });
  assert.match(html, /role="status" class="sr-only">Ukládám…/);
  assert.equal(render({ pending: false, feedback: null, dirty: true }), "");
});

test("success shows 'Uloženo v HH:MM' in Prague time until the next change", () => {
  const feedback = { kind: "saved" as const, at: "2026-10-22T15:36:00.000Z" };
  assert.match(render({ pending: false, feedback, dirty: false }), /Uloženo v 17:36/);
  assert.equal(render({ pending: false, feedback, dirty: true }), "", "a new change hides it");
});

test("errors are shown (whole save and banner-only)", () => {
  assert.match(
    render({
      pending: false,
      feedback: { kind: "error", message: "Předmět i text jsou povinné." },
      dirty: true,
    }),
    /role="alert"[^>]*>Uložení se nezdařilo: Předmět i text jsou povinné\./,
  );
  const partial = render({
    pending: false,
    feedback: {
      kind: "saved",
      at: "2026-10-22T15:36:00.000Z",
      bannerError: "Banner se neuložil: X.",
    },
    dirty: true,
  });
  assert.match(partial, /Banner se neuložil: X\. Ostatní úpravy jsou uložené\./);
  assert.match(partial, /Uloženo v 17:36/);
});
