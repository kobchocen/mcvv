import assert from "node:assert/strict";
import { test } from "node:test";

import {
  formatStartCountdown,
  isLongCountdown,
  startCountdown,
  type StartCountdownMessages,
} from "./start-countdown";
import { prestartCountdown } from "./prestarter-core";

const planned = Date.UTC(2026, 11, 6, 9, 15, 0);

const cs: StartCountdownMessages = {
  hours: (hours, minutes) => `za ${hours} h ${minutes} min`,
  hoursAgo: (hours, minutes) => `před ${hours} h ${minutes} min`,
  hoursShort: (hours) => `za ${hours} h`,
  hoursShortAgo: (hours) => `před ${hours} h`,
};

const en: StartCountdownMessages = {
  hours: (hours, minutes) => `in ${hours} h ${minutes} min`,
  hoursAgo: (hours, minutes) => `${hours} h ${minutes} min ago`,
  hoursShort: (hours) => `in ${hours} h`,
  hoursShortAgo: (hours) => `${hours} h ago`,
};

test("countdown: clock under an hour, hours and minutes under a day, then the date", () => {
  assert.deepEqual(startCountdown(299_000, planned), { kind: "clock", text: "−4:59" });
  assert.deepEqual(startCountdown(-3_000, planned), { kind: "clock", text: "+0:03" });
  assert.deepEqual(startCountdown(0, planned), { kind: "clock", text: "+0:00" });
  assert.deepEqual(startCountdown(3_599_400, planned), { kind: "clock", text: "−59:59" });
  assert.deepEqual(startCountdown(3_599_600, planned), {
    kind: "hours",
    hours: 1,
    minutes: 0,
    past: false,
  });
  assert.deepEqual(startCountdown((3 * 60 + 34) * 60_000 + 20_000, planned), {
    kind: "hours",
    hours: 3,
    minutes: 34,
    past: false,
  });
  assert.deepEqual(startCountdown(-2 * 3_600_000, planned), {
    kind: "hours",
    hours: 2,
    minutes: 0,
    past: true,
  });
  // STG / starter screen: −211:39:54 → only the start date
  assert.deepEqual(startCountdown((211 * 3600 + 39 * 60 + 54) * 1000, planned), {
    kind: "date",
    at: planned,
  });
  assert.equal(startCountdown(24 * 3_600_000 - 500, planned).kind, "date");
  assert.equal(startCountdown(24 * 3_600_000 - 1_000, planned).kind, "hours");
});

test("prestartCountdown stays an alias of the shared formatter", () => {
  const remaining = (3 * 60 + 22) * 60_000;
  assert.deepEqual(prestartCountdown(remaining, planned), startCountdown(remaining, planned));
  assert.deepEqual(prestartCountdown(299_000, planned), startCountdown(299_000, planned));
});

test("isLongCountdown is false only under an hour", () => {
  assert.equal(isLongCountdown(3_599_400), false);
  assert.equal(isLongCountdown(-3_000), false);
  assert.equal(isLongCountdown(3_599_600), true);
  assert.equal(isLongCountdown(24 * 3_600_000), true);
});

test("starter and pre-starter share the same visible labels", () => {
  assert.equal(formatStartCountdown(299_000, planned, "cs", cs), "−4:59");
  assert.equal(formatStartCountdown(-3_000, planned, "cs", cs), "+0:03");
  assert.equal(formatStartCountdown((3 * 60 + 22) * 60_000, planned, "cs", cs), "za 3 h 22 min");
  assert.equal(formatStartCountdown((3 * 60 + 22) * 60_000, planned, "cs", cs, true), "za 3 h");
  assert.equal(formatStartCountdown(-2 * 3_600_000, planned, "cs", cs), "před 2 h 0 min");
  assert.equal(formatStartCountdown(-2 * 3_600_000, planned, "cs", cs, true), "před 2 h");
  assert.equal(
    formatStartCountdown((211 * 3600 + 39 * 60 + 54) * 1000, planned, "cs", cs),
    "6. 12.",
  );
  assert.equal(
    formatStartCountdown((211 * 3600 + 39 * 60 + 54) * 1000, planned, "en", en),
    "6 Dec",
  );
  assert.equal(formatStartCountdown((3 * 60 + 22) * 60_000, planned, "en", en), "in 3 h 22 min");
});
