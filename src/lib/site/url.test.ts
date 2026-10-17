import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_SITE_URL, siteUrl } from "./url";

test("siteUrl defaults to https://mcvv.org", () => {
  assert.equal(siteUrl({}), DEFAULT_SITE_URL);
  assert.equal(siteUrl({ SITE_URL: "  " }), DEFAULT_SITE_URL);
  assert.equal(siteUrl({ SITE_URL: "not a url" }), DEFAULT_SITE_URL);
  assert.equal(siteUrl({ SITE_URL: "ftp://mcvv.org" }), DEFAULT_SITE_URL);
});

test("siteUrl uses SITE_URL origin without trailing slash", () => {
  assert.equal(siteUrl({ SITE_URL: "https://dev.mcvv.org/" }), "https://dev.mcvv.org");
  assert.equal(siteUrl({ SITE_URL: "http://localhost:3000/cs" }), "http://localhost:3000");
});
