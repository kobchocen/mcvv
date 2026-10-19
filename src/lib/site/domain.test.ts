import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

test("no source file references the old mcvv.cz domain", () => {
  const offenders = files("src")
    .filter((f) => /\.(ts|tsx|json)$/.test(f) && !f.endsWith("domain.test.ts"))
    .filter((f) => /\bmcvv\.cz\b/i.test(readFileSync(f, "utf8")));
  assert.deepEqual(offenders, []);
});
