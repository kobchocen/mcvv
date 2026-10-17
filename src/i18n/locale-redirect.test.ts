import assert from "node:assert/strict";
import { test } from "node:test";

import { localeRedirectTarget } from "./locale-redirect";

test("unprefixed page paths redirect to /cs and keep the query string", () => {
  assert.equal(localeRedirectTarget("/registrace", ""), "/cs/registrace");
  assert.equal(
    localeRedirectTarget("/prihlaseni", "?next=%2Fprihlasky"),
    "/cs/prihlaseni?next=%2Fprihlasky",
  );
  assert.equal(localeRedirectTarget("/prihlasky/", ""), "/cs/prihlasky");
  assert.equal(localeRedirectTarget("/navod", "?a=1&b=2"), "/cs/navod?a=1&b=2");
  assert.equal(localeRedirectTarget("/statistiky/vitezove", ""), "/cs/statistiky/vitezove");
  assert.equal(localeRedirectTarget("/admin/prihlasky", ""), "/cs/admin/prihlasky");
});

test("prefixed, root and unknown paths are left alone", () => {
  assert.equal(localeRedirectTarget("/cs/registrace", ""), null);
  assert.equal(localeRedirectTarget("/en/prihlaseni", ""), null);
  assert.equal(localeRedirectTarget("/", ""), null);
  assert.equal(localeRedirectTarget("/api/version", ""), null);
  assert.equal(localeRedirectTarget("/neexistuje", ""), null);
});
