import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

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
    const missing = pages.filter((path) => !GUARD.test(readFileSync(path, "utf8")));
    assert.deepEqual(missing, []);
  });

  it("race-day page uses the race-day guard, the rest full staff", () => {
    const raceDay = readFileSync(join(ROOT, "app/[locale]/admin/den-zavodu/page.tsx"), "utf8");
    assert.match(raceDay, /await requireRaceDay\(\)/);
    const users = readFileSync(join(ROOT, "app/[locale]/admin/uzivatele/page.tsx"), "utf8");
    assert.match(users, /await requireAdmin\(\)/);
  });

  it("every exported admin server action calls a guard", () => {
    const actionFiles = files(join(ROOT, "lib/admin"), (name) => name.endsWith(".ts")).filter(
      (path) => readFileSync(path, "utf8").startsWith('"use server"'),
    );
    for (const path of actionFiles) {
      const source = readFileSync(path, "utf8");
      const bodies = source.split(/\nexport async function /).slice(1);
      for (const body of bodies) {
        const name = body.slice(0, body.indexOf("("));
        assert.match(body, GUARD, `${path}: ${name}`);
      }
    }
  });

  it("race-day API checks access before doing anything", () => {
    const route = readFileSync(join(ROOT, "app/api/den-zavodu/obd-export/route.ts"), "utf8");
    const get = route.slice(route.indexOf("export async function GET"));
    assert.ok(get.indexOf("raceDayAccess()") < get.indexOf("loadObdExportData()"));
  });
});
