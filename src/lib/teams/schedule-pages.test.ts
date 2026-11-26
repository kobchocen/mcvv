import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";

const ROOT = process.cwd();

const PATHS = [
  "src/app/[locale]/program",
  "src/app/[locale]/navod",
  "src/app/[locale]/pokyny",
  "src/components/templates/mcvv-program-template.tsx",
  "src/components/templates/mcvv-program-content.ts",
  "src/lib/race/program.ts",
];

const SOURCE_EXT = /\.(?:cts|mts|ts|tsx|js|jsx)$/;
const IMPORT_RE =
  /(?:\bimport\s*(?:type\s*)?(?:[\s\S]*?)\s*from\s*|\bexport\s*(?:type\s*)?(?:[\s\S]*?)\s*from\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)["']([^"']+)["']/g;

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function importedSpecifiers(source: string): string[] {
  const text = stripComments(source);
  return [...text.matchAll(IMPORT_RE)].map((match) => match[1]);
}

function isTeamCompetitionPath(relPath: string): boolean {
  const normalized = relPath.replaceAll("\\", "/").replace(/^\.\/+/, "");
  const withoutSrc = normalized.startsWith("src/") ? normalized.slice(4) : normalized;
  return (
    withoutSrc === "lib/teams" ||
    withoutSrc.startsWith("lib/teams/") ||
    /(?:^|\/)mcvv-team-[^/]+$/.test(withoutSrc)
  );
}

function resolvesToTeamModule(specifier: string, fromFile: string): boolean {
  if (specifier.startsWith("@/")) {
    return isTeamCompetitionPath(specifier.slice(2));
  }
  if (specifier.startsWith(".") || specifier.startsWith("/")) {
    const resolved = path.normalize(path.join(path.dirname(fromFile), specifier));
    return isTeamCompetitionPath(path.relative(ROOT, resolved));
  }
  return false;
}

function listedSourceFiles(): string[] {
  const files: string[] = [];
  const visit = (rel: string) => {
    const abs = path.join(ROOT, rel);
    const stat = fs.statSync(abs);
    if (stat.isFile()) {
      files.push(rel);
      return;
    }
    if (!stat.isDirectory()) return;
    for (const name of fs.readdirSync(abs).sort()) {
      const child = path.join(rel, name);
      const childStat = fs.statSync(path.join(ROOT, child));
      if (childStat.isDirectory()) visit(child);
      else if (SOURCE_EXT.test(name) && !name.endsWith(".d.ts")) files.push(child);
    }
  };
  for (const rel of PATHS) visit(rel);
  return files;
}

test("import scanner treats team-competition modules as violations", () => {
  const from = path.join(ROOT, "src/app/[locale]/program/page.tsx");
  assert.equal(resolvesToTeamModule("@/lib/teams", from), true);
  assert.equal(resolvesToTeamModule("@/lib/teams/scoring", from), true);
  assert.equal(resolvesToTeamModule("@/components/organisms/mcvv-team-standings", from), true);
  assert.equal(resolvesToTeamModule("../../../../lib/teams/query", from), true);
  assert.equal(resolvesToTeamModule("@/lib/race/program", from), false);
  assert.equal(resolvesToTeamModule("@/components/organisms", from), false);
  assert.deepEqual(importedSpecifiers('import { score } from "@/lib/teams/scoring";\n'), [
    "@/lib/teams/scoring",
  ]);
  assert.deepEqual(importedSpecifiers('export { x } from "@/lib/teams";\n'), ["@/lib/teams"]);
  assert.deepEqual(importedSpecifiers('const m = await import("@/lib/teams/live");\n'), [
    "@/lib/teams/live",
  ]);
  assert.equal(importedSpecifiers('// import { score } from "@/lib/teams";\n').length, 0);
});

test("/program, /navod and /pokyny do not import team-competition modules", () => {
  const files = listedSourceFiles();
  assert.ok(files.length > 0, "expected schedule page sources to exist");
  const missing = PATHS.filter((rel) => !fs.existsSync(path.join(ROOT, rel)));
  assert.deepEqual(missing, [], `missing schedule paths: ${missing.join(", ")}`);

  const violations: string[] = [];
  for (const rel of files) {
    const source = fs.readFileSync(path.join(ROOT, rel), "utf8");
    for (const specifier of importedSpecifiers(source)) {
      if (resolvesToTeamModule(specifier, path.join(ROOT, rel))) {
        violations.push(`${rel} imports ${specifier}`);
      }
    }
  }
  assert.deepEqual(violations, []);
});
