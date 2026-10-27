import assert from "node:assert/strict";
import { test } from "node:test";

import robots from "./robots";

test("production robots: everything allowed except duplicate query variants (#199)", () => {
  const previous = process.env.APP_ENV;
  delete process.env.APP_ENV;
  try {
    const result = robots();
    const rules = Array.isArray(result.rules) ? result.rules[0] : result.rules;
    assert.equal(rules.userAgent, "*");
    assert.equal(rules.allow, "/");
    assert.ok(Array.isArray(rules.disallow));
    assert.ok(rules.disallow.includes("/*/bezec/*?"));
    assert.ok(rules.disallow.includes("/*/kluby?*razeni="));
    // Club list paging and result archive years stay crawlable.
    assert.ok(!rules.disallow.some((rule) => rule.includes("strana") || rule.includes("year")));
    assert.equal(rules.crawlDelay, 2);
    assert.match(String(result.sitemap), /\/sitemap\.xml$/);
  } finally {
    if (previous === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = previous;
  }
});

test("staging robots disallow everything", () => {
  const previous = process.env.APP_ENV;
  process.env.APP_ENV = "stg";
  try {
    assert.deepEqual(robots().rules, { userAgent: "*", disallow: "/" });
  } finally {
    if (previous === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = previous;
  }
});
