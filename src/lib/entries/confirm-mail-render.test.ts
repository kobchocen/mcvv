import assert from "node:assert/strict";
import { test } from "node:test";

import { renderEntryConfirmation, raceDateLabel } from "./confirm-mail-render";

const input = {
  year: 2026,
  id: 7,
  email: "a@b.cz",
  name: "Jana <Nováková>",
  lines: [
    { runner: "Jana Nováková", club: "K.O.B. Choceň", category: "D35", fee: 250 },
    { runner: "Petr Novák", club: "K.O.B. Choceň", category: "H10", fee: 150 },
  ],
  fee: 400,
  paid: 400,
  site: "https://mcvv.org",
};

test("datum závodu 2026 je 6. 12. 2026", () => {
  assert.equal(raceDateLabel(2026), "6. 12. 2026");
});

test("potvrzení má brandovaný layout, závodníky, součty a odkazy", () => {
  const { subject, html, text } = renderEntryConfirmation(input);
  assert.equal(subject, "Potvrzení přihlášky 2026/7");
  assert.match(html, /border-bottom:4px solid #e2531c/);
  assert.match(html, /Jana &lt;Nováková&gt;/);
  assert.doesNotMatch(html, /<Nováková>/);
  assert.match(html, /D35/);
  assert.match(html, /https:\/\/mcvv\.org\/prihlasky/);
  assert.doesNotMatch(html, /navod|Návod|návod/);
  assert.doesNotMatch(text, /navod|Návod|návod/);
  assert.match(html, /Tým pořadatelů z K\.O\.B\. Choceň/);
  assert.match(
    html,
    /Doklad o zaplacení startovného \(PDF\) si stáhnete v sekci <a href="https:\/\/mcvv\.org\/prihlasky"/,
  );
  assert.match(
    text,
    /Doklad o zaplacení startovného \(PDF\) si stáhnete v sekci https:\/\/mcvv\.org\/prihlasky/,
  );
  assert.doesNotMatch(html, /QR|platí až po zaplacení/i);
  assert.match(text, /Petr Novák · K\.O\.B\. Choceň · H10 · 150 Kč/);
  assert.match(text, /Startovné celkem: 400 Kč\nZaplaceno: 400 Kč\nZbývá zaplatit: 0 Kč/);
  assert.match(text, /6\. 12\. 2026, Velká Veranda, Choceň, intervalový start od 10:15/);
  assert.match(html, /Intervalový start od 10:15/);
  assert.doesNotMatch(html + text, /[Ss]tart v 10:15/);
});
