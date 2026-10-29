import assert from "node:assert/strict";
import { test } from "node:test";

import {
  HOME_COUNTS_REVALIDATE_SECONDS,
  HOME_RESULTS_REVALIDATE_SECONDS,
  toHomeWinner,
  type HomeResultsSummary,
} from "./summary-core";

test("toHomeWinner prefers the name stored with the result", () => {
  assert.deepEqual(
    toHomeWinner({
      runnerId: "1990ABCD",
      runnerName: "Nováková Jana",
      time: 1500,
      runner: { name: "Svobodová Jana" },
    }),
    { runnerId: "1990ABCD", name: "Nováková Jana", time: 1500 },
  );
});

test("toHomeWinner falls back to the registry name and handles no winner", () => {
  assert.deepEqual(
    toHomeWinner({
      runnerId: "1985WXYZ",
      runnerName: "  ",
      time: 1400,
      runner: { name: "Dvořák Petr" },
    }),
    { runnerId: "1985WXYZ", name: "Dvořák Petr", time: 1400 },
  );
  assert.equal(toHomeWinner(null), null);
});

test("cached homepage summary survives the unstable_cache JSON round trip", () => {
  const summary: HomeResultsSummary = {
    year: 2025,
    count: 291,
    men: toHomeWinner({
      runnerId: "1985WXYZ",
      runnerName: "Dvořák Petr",
      time: 1400,
      runner: null,
    }),
    women: null,
  };
  assert.deepEqual(JSON.parse(JSON.stringify(summary)), summary);
});

test("hero counts refresh within a minute, results summary hourly (plus tag revalidation)", () => {
  assert.equal(HOME_COUNTS_REVALIDATE_SECONDS, 60);
  assert.equal(HOME_RESULTS_REVALIDATE_SECONDS, 3600);
});
