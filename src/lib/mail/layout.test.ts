import assert from "node:assert/strict";
import { test } from "node:test";

import { officialLogoEmailUrl } from "@/lib/print/official-logo-shared";

import { renderBrandedEmail, renderTransactionalEmail } from "./layout";

test("transactional e-mail has branded HTML and a text fallback with the link", () => {
  const url = "https://mcvv.org/api/auth/verify?token=abc&locale=cs";
  const { html, text } = renderTransactionalEmail({
    subject: "Ověření e-mailu",
    locale: "cs",
    site: "https://mcvv.org",
    paragraphs: ["Ahoj <script>"],
    action: { label: "Ověřit e-mail", url },
  });
  assert.match(html, /<!doctype html>/);
  assert.match(html, /border-bottom:4px solid #e2531c/);
  assert.match(
    html,
    /<img src="https:\/\/mcvv\.org\/images\/logo\/mcvv-logo-barevne-na-tmave\.png"/,
  );
  assert.doesNotMatch(html, /data:image|base64|cid:/);
  assert.equal(
    officialLogoEmailUrl("https://mcvv.org"),
    "https://mcvv.org/images/logo/mcvv-logo-barevne-na-tmave.png",
  );
  assert.match(html, /Ahoj &lt;script&gt;/);
  assert.match(html, /token=abc&amp;locale=cs/);
  assert.doesNotMatch(html, /<script\b/i);
  assert.match(text, /Ověřit e-mail: https:\/\/mcvv\.org\/api\/auth\/verify\?token=abc&locale=cs/);
});

test("branded e-mail header uses the same hosted official logo", () => {
  const { html } = renderBrandedEmail({
    subject: "Potvrzení",
    site: "https://mcvv.org",
    htmlBlocks: ["<p>Ahoj</p>"],
    text: "Ahoj",
  });
  assert.match(
    html,
    /<img src="https:\/\/mcvv\.org\/images\/logo\/mcvv-logo-barevne-na-tmave\.png"/,
  );
  assert.doesNotMatch(html, /data:image|base64|cid:/);
});
