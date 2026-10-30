import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  analyzeSvg,
  detectBitmapType,
  logoResponseHeaders,
  sanitizeSvg,
  validateLogo,
} from "./logo-file";

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

  it("drops comments, including ones hiding markup", () => {
    const out = sanitizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><!-- <script>alert(1)</script> --><!--<!-- x -->--><rect/></svg>',
    );
    assert.ok(out === null || !/<!--|script|alert/i.test(out));
    const simple = sanitizeSvg("<svg><!-- note --><rect/></svg>");
    assert.equal(simple, "<svg><rect/></svg>");
  });

  it("removes nested and obfuscated event handler attributes", () => {
    const out = sanitizeSvg(
      '<svg><g ononload="x" onclick="a()" ONLOAD="b()" svg:onmouseover="c()"><rect onloadonload=\'d()\' oonnload=e width="1"/></g></svg>',
    );
    assert.ok(out);
    assert.doesNotMatch(out, /\son|alert|a\(\)|b\(\)|c\(\)|d\(\)/i);
    assert.match(out, /width="1"/);
  });

  it("removes upper/mixed case script elements", () => {
    for (const s of [
      "<svg><SCRIPT>alert(1)</SCRIPT><rect/></svg>",
      "<svg><ScRiPt type='text/javascript'>alert(1)</sCrIpT><rect/></svg>",
      "<svg><svg:script>alert(1)</svg:script><rect/></svg>",
      "<svg><scr<script>ipt>alert(1)</script></svg>",
    ]) {
      const out = sanitizeSvg(s);
      assert.ok(out === null || !/script|alert/i.test(out), s);
    }
  });

  it("removes javascript: in xlink:href, including obfuscated forms", () => {
    for (const s of [
      '<svg><use xlink:href="javascript:alert(1)"/></svg>',
      '<svg><a xlink:href=" JaVaScRiPt:alert(1)"><rect/></a></svg>',
      '<svg><use xlink:href="java&#x09;script:alert(1)"/></svg>',
      '<svg><image href="data:text/html;base64,PHNjcmlwdD4="/></svg>',
    ]) {
      const out = sanitizeSvg(s);
      assert.ok(out, s);
      assert.doesNotMatch(out, /javascript|alert|data:text|href/i, s);
    }
    assert.match(
      sanitizeSvg('<svg><image href="data:image/png;base64,AAAA"/></svg>') ?? "",
      /href="data:image\/png;base64,AAAA"/,
    );
  });

  it("drops foreignObject subtrees", () => {
    const out = sanitizeSvg("<svg><foreignObject><a><div>x</div></a></foreignObject><rect/></svg>");
    assert.equal(out, "<svg><rect/></svg>");
  });

  it("finds raw-text close tags case-insensitively without regex injection", () => {
    assert.equal(
      sanitizeSvg("<svg><STYLE>.a{fill:red}</style  ><rect/></svg>"),
      "<svg><STYLE>.a{fill:red}</STYLE><rect/></svg>",
    );
    assert.equal(sanitizeSvg("<svg><script>alert(1)</scriptx></svg>"), null);
    assert.equal(
      sanitizeSvg("<svg><svg:script>a</svg:script ><rect/></svg>"),
      "<svg><rect/></svg>",
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

  it("accepts a CorelDRAW export (DOCTYPE, comment, CDATA style, metadata) and stores it sanitized", () => {
    const corel = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">',
      "<!-- Creator: CorelDRAW X6 -->",
      '<svg xmlns="http://www.w3.org/2000/svg" xml:space="preserve" width="210mm" height="99mm" version="1.1" style="fill-rule:evenodd; clip-rule:evenodd"',
      'viewBox="0 0 21000 9900"',
      ' xmlns:xlink="http://www.w3.org/1999/xlink">',
      " <defs>",
      '  <style type="text/css">',
      "   <![CDATA[",
      "    .fil0 {fill:#00CCFF}",
      "   ]]>",
      "  </style>",
      " </defs>",
      ' <g id="Vrstva_x0020_1">',
      '  <metadata id="CorelCorpID_0Corel-Layer"/>',
      '  <path class="fil0" d="M100 100l200 0 0 200 -200 0z"/>',
      " </g>",
      "</svg>",
    ].join("\n");
    const result = validateLogo(Buffer.from(corel), "kudos.svg");
    assert.equal(result.ok, true);
    const svg = result.ok ? result.data.toString("utf8") : "";
    assert.match(svg, /^<svg /);
    assert.doesNotMatch(svg, /DOCTYPE|CorelDRAW|CDATA|<metadata|<\?xml/);
    assert.match(svg, /<style type="text\/css">\s*\.fil0 \{fill:#00CCFF\}\s*<\/style>/);
    assert.match(svg, /<path class="fil0" d="M100 100l200 0 0 200 -200 0z"\/>/);
  });

  it("accepts only harmless DOCTYPEs and reports why an SVG is rejected", () => {
    for (const doctype of [
      "<!DOCTYPE svg>",
      '<!doctype svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">',
      "<!DOCTYPE svg SYSTEM 'svg11.dtd'>",
    ]) {
      assert.deepEqual(analyzeSvg(`${doctype}\n${clean}`), { ok: true, svg: clean }, doctype);
    }
    const reasons: [string, string][] = [
      ['<!DOCTYPE svg [<!ENTITY x "y">]><svg>&x;</svg>', "svg-entities"],
      [
        '<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "svg11.dtd" [<!ENTITY ns_svg "http://www.w3.org/2000/svg">]><svg/>',
        "svg-entities",
      ],
      ['<!DOCTYPE svg SYSTEM "file:///etc/passwd"><!DOCTYPE svg><svg></svg>', "svg-entities"],
      ['<svg><!ENTITY x "y"><rect/></svg>', "svg-entities"],
      [`${clean}<!DOCTYPE svg>`, "svg-entities"],
      ["<svg><style>.a{-moz-binding:x}</style></svg>", "svg-external"],
      ["<html><body></body></html>", "svg-not-svg"],
      ["hello <svg></svg>", "svg-not-svg"],
      ["<svg><g></svg>", "svg-malformed"],
      ["<svg><rect", "svg-malformed"],
      ["<svg><!-- never closed <rect/></svg>", "svg-malformed"],
    ];
    for (const [input, reason] of reasons) {
      assert.deepEqual(analyzeSvg(input), { ok: false, reason }, input);
      assert.deepEqual(validateLogo(Buffer.from(input), "logo.svg"), { ok: false, reason }, input);
    }
  });

  it("drops metadata subtrees including their text", () => {
    assert.equal(
      sanitizeSvg(
        "<svg><metadata><rdf:RDF><dc:title>secret</dc:title></rdf:RDF>note</metadata><rect/></svg>",
      ),
      "<svg><rect/></svg>",
    );
  });

  it("never throws on hostile input", () => {
    for (const input of ["", "<", "<!", "<svg", "\uFEFF", "<svg>".repeat(5000), "<![CDATA[x]]>"]) {
      const result = validateLogo(Buffer.from(input), "logo.svg");
      assert.equal(typeof result.ok, "boolean", input.slice(0, 20));
    }
  });

  it("serves logos with sandboxing headers", () => {
    const headers = logoResponseHeaders("image/svg+xml", 10);
    assert.match(headers["Content-Security-Policy"], /sandbox/);
    assert.equal(headers["X-Content-Type-Options"], "nosniff");
  });
});
