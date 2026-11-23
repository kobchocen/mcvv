import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { test } from "node:test";

const PATHS = [
  "src/app/[locale]/program",
  "src/app/[locale]/navod",
  "src/app/[locale]/pokyny",
  "src/components/templates/mcvv-program-template.tsx",
  "src/components/templates/mcvv-program-content.ts",
  "src/lib/race/program.ts",
];

test("/program, /navod and /pokyny stay bit-identical to origin/develop", () => {
  const out = execFileSync("git", ["diff", "origin/develop", "--", ...PATHS], {
    encoding: "utf8",
  });
  assert.equal(out, "", out);
});
