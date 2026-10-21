import assert from "node:assert/strict";
import { test } from "node:test";

import { renderOrganizerDigest, renderUserNotification } from "./mail-render";

test("upozornění přihlašujícímu: escapuje text a odkazuje na vlákno", () => {
  const mail = renderUserNotification({
    site: "https://www.mcvv.org",
    threadUrl: "https://www.mcvv.org/cs/zpravy/5",
    label: "přihláška 2026/4",
    body: "Opraveno <b>",
  });
  assert.match(mail.subject, /2026\/4/);
  assert.match(mail.html, /Opraveno &lt;b&gt;/);
  assert.match(mail.text, /https:\/\/www\.mcvv\.org\/cs\/zpravy\/5/);
});

test("souhrn pořadateli: položky s odkazy do administrace", () => {
  const mail = renderOrganizerDigest({
    site: "https://www.mcvv.org",
    adminUrl: "https://www.mcvv.org/cs/admin/zpravy",
    items: [
      {
        label: "přihláška 2026/4",
        excerpt: "Dotaz",
        url: "https://x/cs/admin/zpravy/1",
        unread: 2,
      },
    ],
  });
  assert.match(mail.subject, /1 nová konverzace/);
  assert.match(mail.html, /admin\/zpravy\/1/);
  assert.match(mail.text, /přihláška 2026\/4 \(2\): Dotaz/);
});

test("souhrn pořadateli: sekce Změny přihlášek vedle zpráv (#130)", () => {
  const mail = renderOrganizerDigest({
    site: "https://www.mcvv.org",
    adminUrl: "https://www.mcvv.org/cs/admin/zpravy",
    items: [{ label: "přihláška 2026/4", excerpt: "Dotaz", url: "https://x/z/1", unread: 1 }],
    changes: [
      {
        label: "přihláška 2026/12 – SK <Choceň>",
        url: "https://x/cs/admin/prihlasky/2026/12",
        lines: ["1. 5. 12:00 Přihlášen závodník: Novák Jan (19900012)"],
      },
    ],
    changesMore: 2,
    registrationsUrl: "https://x/cs/admin/prihlasky",
  });
  assert.match(mail.subject, /1 nová konverzace se zprávami a změny přihlášek \(3\)/);
  assert.match(mail.html, /Změny přihlášek/);
  assert.match(mail.html, /SK &lt;Choceň&gt;/);
  assert.match(mail.html, /admin\/prihlasky\/2026\/12/);
  assert.match(mail.text, /ZMĚNY PŘIHLÁŠEK/);
  assert.match(mail.text, /· 1\. 5\. 12:00 Přihlášen závodník/);
  assert.match(mail.text, /a další přihlášky se změnami: 2/);
});

test("souhrn pořadateli jen se změnami přihlášek", () => {
  const mail = renderOrganizerDigest({
    site: "https://www.mcvv.org",
    adminUrl: "https://www.mcvv.org/cs/admin/zpravy",
    items: [],
    changes: [
      { label: "přihláška 2026/12", url: "https://x/p/12", lines: ["Založena nová přihláška"] },
    ],
  });
  assert.equal(mail.subject, "MCVV: změny přihlášek (1)");
  assert.doesNotMatch(mail.html, /nepřečtených zpráv/);
});
