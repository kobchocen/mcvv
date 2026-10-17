import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { detectBitmapType, logoResponseHeaders, sanitizeSvg, validateLogo } from "./logo-file";

const clean =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#e2531c"/></svg>';

describe("partner logo upload", () => {
  it("detects bitmap formats by magic bytes", () => {
    assert.equal(
      detectBitmapType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
      "image/png",
    );
    assert.equal(detectBitmapType(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), "image/jpeg");
    assert.equal(detectBitmapType(Buffer.from("RIFF\0\0\0\0WEBPVP8 ")), "image/webp");
    assert.equal(detectBitmapType(Buffer.from("<html>")), null);
  });

  it("keeps a clean SVG", () => {
    assert.equal(sanitizeSvg(`<?xml version="1.0"?>\n${clean}`), clean);
  });

  it("strips scripts, handlers, foreignObject and external refs", () => {
    const dirty =
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script>' +
      '<foreignObject><div>x</div></foreignObject><a href="https://evil.example"><rect/></a>' +
      '<use xlink:href="#ok"/><image href="http://evil.example/x.png"/>' +
      "<style>@import url(https://evil.example/a.css); .a{fill:url(https://evil.example/f)}</style></svg>";
    const out = sanitizeSvg(dirty);
    assert.ok(out);
    assert.doesNotMatch(out, /script|onload|foreignObject|evil\.example|@import/i);
    assert.match(out, /xlink:href="#ok"/);
  });

  it("rejects DTD/entities and non-SVG", () => {
    assert.equal(sanitizeSvg('<!DOCTYPE svg [<!ENTITY x "y">]><svg></svg>'), null);
    assert.equal(sanitizeSvg("<html><body></body></html>"), null);
    assert.equal(
      sanitizeSvg('<svg><a href="javascript:alert(1)">x</a></svg>')?.includes("javascript"),
      false,
    );
  });

  it("validates uploads", () => {
    assert.deepEqual(validateLogo(Buffer.alloc(0), "a.png"), { ok: false, reason: "empty" });
    assert.deepEqual(validateLogo(Buffer.alloc(2 * 1024 * 1024, 1), "a.png"), {
      ok: false,
      reason: "too-large",
    });
    assert.deepEqual(validateLogo(Buffer.from("<html></html>"), "a.html"), {
      ok: false,
      reason: "unsupported",
    });
    const svg = validateLogo(Buffer.from(clean), "logo.svg");
    assert.equal(svg.ok && svg.type, "image/svg+xml");
  });

  it("serves logos with sandboxing headers", () => {
    const headers = logoResponseHeaders("image/svg+xml", 10);
    assert.match(headers["Content-Security-Policy"], /sandbox/);
    assert.equal(headers["X-Content-Type-Options"], "nosniff");
  });
});
