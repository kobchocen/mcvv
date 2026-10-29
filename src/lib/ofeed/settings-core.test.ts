import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isOfeedUrl,
  OFEED_KEYS,
  parseProfile,
  profileKeys,
  ofeedPublicUrl,
  parseEventId,
  parsePassword,
  passwordExpiresAt,
  onlineResultsOverrideUrl,
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
  const live = { profile: "live" as const, publicEventId: "abc123" };
  assert.equal(resolveOnlineResultsUrl("https://x.cz/", live), "https://x.cz/");
  assert.equal(
    resolveOnlineResultsUrl(null, live),
    "https://orienteerfeed.com/events/abc123?tab=results",
  );
  assert.equal(resolveOnlineResultsUrl(null, null), null);
  assert.equal(resolveOnlineResultsUrl(null, { profile: "live", publicEventId: null }), null);
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
    profile: "live",
    eventId: "abc123",
    hasPassword: true,
    passwordSetAt: new Date("2026-12-01T10:00:00.000Z"),
    profiles: {
      live: {
        eventId: "abc123",
        hasPassword: true,
        passwordSetAt: new Date("2026-12-01T10:00:00.000Z"),
      },
      test: { eventId: null, hasPassword: false, passwordSetAt: null },
    },
    publicEventId: "abc123",
  });
  assert.ok(!JSON.stringify(settings).includes("sealed"));
  assert.deepEqual(passwordExpiresAt(settings.passwordSetAt), new Date("2026-12-08T10:00:00.000Z"));
  assert.equal(settingsFromRows([]).enabled, false);
});

test("test profile uploads elsewhere and hides OFeed from the public web (Q33)", () => {
  const rows = [
    { key: OFEED_KEYS.enabled, text: "1" },
    { key: OFEED_KEYS.eventId, text: "liveEvent1" },
    { key: OFEED_KEYS.password, text: "v1:live" },
    { key: OFEED_KEYS.testEventId, text: "testEvent1" },
    { key: OFEED_KEYS.testPassword, text: "v1:test" },
    { key: OFEED_KEYS.testPasswordSetAt, text: "2026-11-20T08:00:00.000Z" },
  ];
  // bez ofeed_profile = ostrá akce (zpětná kompatibilita)
  assert.equal(settingsFromRows(rows).profile, "live");
  assert.equal(settingsFromRows(rows).eventId, "liveEvent1");
  const testing = settingsFromRows([...rows, { key: OFEED_KEYS.profile, text: "test" }]);
  assert.equal(testing.profile, "test");
  assert.equal(testing.eventId, "testEvent1");
  assert.deepEqual(testing.passwordSetAt, new Date("2026-11-20T08:00:00.000Z"));
  assert.equal(testing.profiles.live.eventId, "liveEvent1");
  assert.equal(testing.publicEventId, null);
  assert.equal(resolveOnlineResultsUrl(null, testing), null);
  // ručně zadaná URL na OFeed se při testu skryje, jiná zůstane
  assert.equal(
    resolveOnlineResultsUrl("https://orienteerfeed.com/events/liveEvent1", testing),
    null,
  );
  assert.equal(resolveOnlineResultsUrl("https://vysledky.cz/", testing), "https://vysledky.cz/");
  // neznámá hodnota profilu = live
  assert.equal(settingsFromRows([...rows, { key: OFEED_KEYS.profile, text: "x" }]).profile, "live");
  assert.ok(!JSON.stringify(testing).includes("v1:"));
});

test("profile helpers", () => {
  assert.equal(parseProfile("test"), "test");
  assert.equal(parseProfile("live"), "live");
  assert.equal(parseProfile("TEST"), null);
  assert.equal(profileKeys("live").eventId, OFEED_KEYS.eventId);
  assert.equal(profileKeys("test").password, OFEED_KEYS.testPassword);
  assert.ok(isOfeedUrl("https://www.orienteerfeed.com/x"));
  assert.ok(!isOfeedUrl("https://orienteerfeed.com.evil.cz/"));
  assert.ok(!isOfeedUrl("nonsense"));
});

test("online results override: only a manual URL, OFeed URL hidden in the test profile", () => {
  assert.equal(onlineResultsOverrideUrl(null, { profile: "live" }), null);
  assert.equal(onlineResultsOverrideUrl("https://x.cz/", { profile: "live" }), "https://x.cz/");
  assert.equal(onlineResultsOverrideUrl("https://x.cz/", { profile: "test" }), "https://x.cz/");
  assert.equal(
    onlineResultsOverrideUrl("https://orienteerfeed.com/events/abc", { profile: "test" }),
    null,
  );
  assert.equal(
    onlineResultsOverrideUrl("https://orienteerfeed.com/events/abc", { profile: "live" }),
    "https://orienteerfeed.com/events/abc",
  );
  assert.equal(onlineResultsOverrideUrl("https://x.cz/", null), "https://x.cz/");
});
