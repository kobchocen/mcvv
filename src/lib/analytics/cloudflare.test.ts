import assert from "node:assert/strict";
import { test } from "node:test";

import { reportOnlyCsp } from "../security/headers";

import { CF_WEB_ANALYTICS_SCRIPT, cloudflareBeaconConfig, isAnalyticsPath } from "./cloudflare";

test("beacon config is rendered only for a plausible token, without SPA tracking", () => {
  assert.equal(cloudflareBeaconConfig(undefined), null);
  assert.equal(cloudflareBeaconConfig(""), null);
  assert.equal(cloudflareBeaconConfig("   "), null);
  assert.equal(cloudflareBeaconConfig("short"), null);
  assert.equal(cloudflareBeaconConfig('abc"}<script>alert(1)</script>'), null);
  const token = "0123456789abcdef0123456789abcdef";
  assert.equal(cloudflareBeaconConfig(` ${token} `), `{"token":"${token}","spa":false}`);
});

test("public pages in every locale are measured", () => {
  for (const path of [
    "/cs",
    "/en/",
    "/de/results/2025",
    "/pl/statistiky/rekordy",
    "/uk/kluby",
    "/cs/bezec/novak-jan",
    "/cs/vysledky/online/H21",
    "/cs/prihlasky",
    "/cs/program",
    "/cs/kontakt",
    "/cs/fotogalerie",
  ]) {
    assert.equal(isAnalyticsPath(path), true, path);
  }
});

test("admin and internal pages are never measured", () => {
  for (const path of [
    "/cs/admin",
    "/en/admin/platby",
    "/cs/administrace",
    "/cs/prihlaseni",
    "/cs/prihlaseni-zavodnici",
    "/cs/registrace",
    "/cs/zalozeni-uctu",
    "/cs/overeni",
    "/cs/obnova-hesla",
    "/cs/zapomenute-heslo",
    "/cs/kancelar/prodejky",
    "/cs/mezicasy/speaker",
    "/cs/resultboard/tv1",
    "/cs/start",
    "/cs/zpravy/12",
    "/cs/newsletter/odhlasit",
    "/cs/neznama-sekce",
    "/csx",
    "/fr",
    "/",
    "",
    null,
    undefined,
  ]) {
    assert.equal(isAnalyticsPath(path), false, String(path));
  }
});

function cspDirectiveTokens(csp: string, name: string): string[] {
  for (const part of csp.split(";")) {
    const tokens = part.trim().split(" ").filter(Boolean);
    if (tokens[0] === name) {
      return tokens.slice(1);
    }
  }
  return [];
}

test("CSP allows the beacon script and its reporting endpoint", () => {
  const csp = reportOnlyCsp();
  const scriptOrigin = new URL(CF_WEB_ANALYTICS_SCRIPT).origin;
  const reportOrigin = new URL("https://cloudflareinsights.com/").origin;
  assert.ok(
    cspDirectiveTokens(csp, "script-src").some((token) => token === scriptOrigin),
    `script-src should allow ${scriptOrigin}`,
  );
  assert.ok(
    cspDirectiveTokens(csp, "connect-src").some((token) => token === reportOrigin),
    `connect-src should allow ${reportOrigin}`,
  );
});
