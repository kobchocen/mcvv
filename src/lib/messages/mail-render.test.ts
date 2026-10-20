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
