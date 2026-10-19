import assert from "node:assert/strict";
import { test } from "node:test";

import { enforcedCsp, parseCspReport, reportOnlyCsp, securityHeaders } from "./headers";

const header = (key: string, dev = false) =>
  securityHeaders({ dev }).find((h) => h.key === key)?.value;

test("security headers include the required protections", () => {
  assert.equal(header("Strict-Transport-Security"), "max-age=31536000");
  assert.equal(header("X-Content-Type-Options"), "nosniff");
  assert.equal(header("Referrer-Policy"), "strict-origin-when-cross-origin");
  assert.equal(header("X-Frame-Options"), "DENY");
  assert.match(header("Permissions-Policy")!, /camera=\(\), microphone=\(\), geolocation=\(\)/);
});

test("enforced CSP contains only non-breaking directives", () => {
  assert.equal(enforcedCsp(), "frame-ancestors 'none'; base-uri 'self'; object-src 'none'");
  assert.doesNotMatch(enforcedCsp(), /script-src|default-src/);
});

test("report-only CSP allows what the site loads (OAuth, jsDelivr font, data images)", () => {
  const csp = reportOnlyCsp();
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /connect-src 'self' https:\/\/cdn\.jsdelivr\.net/);
  assert.match(
    csp,
    /form-action 'self' https:\/\/accounts\.google\.com https:\/\/appleid\.apple\.com/,
  );
  assert.match(csp, /img-src 'self' data: blob:/);
  assert.match(csp, /report-uri \/api\/csp-report/);
  assert.doesNotMatch(csp, /unsafe-eval/);
  assert.match(reportOnlyCsp({ dev: true }), /script-src 'self' 'unsafe-inline' 'unsafe-eval'/);
});

test("parseCspReport handles report-uri and Reporting API and strips query strings", () => {
  const legacy = parseCspReport({
    "csp-report": {
      "document-uri": "https://mcvv.org/cs/prihlasky?token=secret",
      "violated-directive": "img-src",
      "effective-directive": "img-src",
      "blocked-uri": "https://evil.example/x.png?a=1",
    },
  });
  assert.deepEqual(legacy, [
    {
      directive: "img-src",
      blocked: "https://evil.example/x.png",
      document: "https://mcvv.org/cs/prihlasky",
    },
  ]);
  const modern = parseCspReport([
    {
      type: "csp-violation",
      body: {
        documentURL: "https://mcvv.org/en#x",
        effectiveDirective: "script-src-elem",
        blockedURL: "inline",
        sourceFile: "https://mcvv.org/_next/static/chunks/a.js?v=1",
      },
    },
    { type: "deprecation", body: {} },
  ]);
  assert.deepEqual(modern, [
    {
      directive: "script-src-elem",
      blocked: "inline",
      document: "https://mcvv.org/en",
      source: "https://mcvv.org/_next/static/chunks/a.js",
    },
  ]);
  assert.deepEqual(parseCspReport("junk"), []);
  assert.deepEqual(parseCspReport(null), []);
});
