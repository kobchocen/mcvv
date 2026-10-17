import assert from "node:assert/strict";
import { test } from "node:test";

import { renderTransactionalEmail } from "./layout";

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
  assert.match(html, /Ahoj &lt;script&gt;/);
  assert.match(html, /token=abc&amp;locale=cs/);
  assert.doesNotMatch(html, /<script\b/i);
  assert.match(text, /Ověřit e-mail: https:\/\/mcvv\.org\/api\/auth\/verify\?token=abc&locale=cs/);
});
