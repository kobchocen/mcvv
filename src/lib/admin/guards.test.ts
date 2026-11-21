import assert from "node:assert/strict";
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { readGuardSource } from "@/lib/admin/guard-source";

/**
 * Admin layout pouští dovnitř i omezenou roli Časomíra (timing), proto se musí každá
 * admin stránka a každá admin server action hlídat sama. Statická kontrola, ať nová
 * stránka bez stráže neprojde.
 */
const ROOT = new URL("../../", import.meta.url).pathname;

function files(dir: string, match: (name: string) => boolean): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path, match);
    return match(name) ? [path] : [];
  });
}

const GUARD = /await require(Staff|Admin|RaceDay)\(\)/;

describe("admin guards", () => {
  it("every admin page calls a server-side guard", () => {
    const pages = files(join(ROOT, "app/[locale]/admin"), (name) => name === "page.tsx");
    assert.ok(pages.length > 10);
    const missing = pages.filter((path) => !GUARD.test(readGuardSource(path)));
    assert.deepEqual(missing, []);
  });

  it("race-day page uses the race-day guard, the rest full staff", () => {
    const raceDay = readGuardSource(join(ROOT, "app/[locale]/admin/den-zavodu/page.tsx"));
    assert.match(raceDay, /await requireRaceDay\(\)/);
    const users = readGuardSource(join(ROOT, "app/[locale]/admin/uzivatele/page.tsx"));
    assert.match(users, /await requireAdmin\(\)/);
    // Auditní log (#107) obsahuje e-maily a stavy před / po – jen admin.
    const audit = readGuardSource(join(ROOT, "app/[locale]/admin/audit/page.tsx"));
    assert.match(audit, /await requireAdmin\(\)/);
  });

  it("every exported admin server action calls a guard", () => {
    const actionFiles = ["lib/admin", "lib/raceday"]
      .flatMap((dir) => files(join(ROOT, dir), (name) => name.endsWith(".ts")))
      .filter((path) => readGuardSource(path).startsWith('"use server"'));
    for (const path of actionFiles) {
      const source = readGuardSource(path);
      const bodies = source.split(/\nexport async function /).slice(1);
      for (const body of bodies) {
        const name = body.slice(0, body.indexOf("("));
        assert.match(body, GUARD, `${path}: ${name}`);
      }
    }
  });
});
