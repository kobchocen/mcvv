import assert from "node:assert/strict";
import { test } from "node:test";

import {
  OFEED_KEYS,
  ofeedPublicUrl,
  parseEventId,
  parsePassword,
  passwordExpiresAt,
  resolveOnlineResultsUrl,
  settingsFromRows,
} from "./settings-core";

test("event id and password validation", () => {
  assert.equal(parseEventId(" cmg4t3f0i0007my3m5hh50wl2 "), "cmg4t3f0i0007my3m5hh50wl2");
  assert.equal(parseEventId("a/b"), null);
  assert.equal(parseEventId(""), null);
  assert.equal(parsePassword("abcd"), "abcd");
  assert.equal(parsePassword("ab"), null);
  assert.equal(parsePassword("a\nb c d"), null);
});

test("public URL and online-results fallback", () => {
  assert.equal(ofeedPublicUrl("abc123"), "https://orienteerfeed.com/events/abc123?tab=results");
  assert.equal(resolveOnlineResultsUrl("https://x.cz/", "abc123"), "https://x.cz/");
  assert.equal(
    resolveOnlineResultsUrl(null, "abc123"),
    "https://orienteerfeed.com/events/abc123?tab=results",
  );
  assert.equal(resolveOnlineResultsUrl(null, null), null);
});

test("settings rows never expose the password", () => {
  const settings = settingsFromRows([
    { key: OFEED_KEYS.enabled, text: "1" },
    { key: OFEED_KEYS.eventId, text: "abc123" },
    { key: OFEED_KEYS.password, text: "v1:sealed" },
    { key: OFEED_KEYS.passwordSetAt, text: "2026-12-01T10:00:00.000Z" },
  ]);
  assert.deepEqual(settings, {
    enabled: true,
    eventId: "abc123",
    hasPassword: true,
    passwordSetAt: new Date("2026-12-01T10:00:00.000Z"),
  });
  assert.ok(!JSON.stringify(settings).includes("sealed"));
  assert.deepEqual(passwordExpiresAt(settings.passwordSetAt), new Date("2026-12-08T10:00:00.000Z"));
  assert.equal(settingsFromRows([]).enabled, false);
});
