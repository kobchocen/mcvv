import assert from "node:assert/strict";
import { test } from "node:test";

import { reportOnlyCsp } from "../security/headers";

import { CF_WEB_ANALYTICS_SCRIPT, cloudflareBeaconConfig } from "./cloudflare";

test("beacon config is rendered only for a plausible token", () => {
  assert.equal(cloudflareBeaconConfig(undefined), null);
  assert.equal(cloudflareBeaconConfig(""), null);
  assert.equal(cloudflareBeaconConfig("   "), null);
  assert.equal(cloudflareBeaconConfig("short"), null);
  assert.equal(cloudflareBeaconConfig('abc"}<script>alert(1)</script>'), null);
  const token = "0123456789abcdef0123456789abcdef";
  assert.equal(cloudflareBeaconConfig(` ${token} `), `{"token":"${token}"}`);
});

test("CSP allows the beacon script and its reporting endpoint", () => {
  const csp = reportOnlyCsp();
  const scriptOrigin = new URL(CF_WEB_ANALYTICS_SCRIPT).origin;
  assert.match(csp, new RegExp(`script-src [^;]*${scriptOrigin.replace(/[./]/g, "\\$&")}`));
  assert.match(csp, /connect-src [^;]*https:\/\/cloudflareinsights\.com/);
});
