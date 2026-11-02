import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// Server actions / pages need the Next.js request context, so guards are checked in the source.
const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const action = read("./runner-rename-actions.ts");
const apply = read("./runner-rename.ts");

test("runner rename is admin only, guarded on the first line of the action", () => {
  const start = action.indexOf("export async function renameRunnerAction(");
  assert.ok(start >= 0);
  const firstLine = action.slice(start).split("\n")[1] ?? "";
  assert.match(firstLine, /await requireAdmin\(\)/);
});

test("rename writes name, year rows and audit in one transaction", () => {
  const tx = apply.slice(apply.indexOf("prisma.$transaction("));
  assert.match(tx, /FOR UPDATE/);
  assert.match(tx, /tx\.runner\.update\(/);
  assert.match(tx, /tx\.result\.update\(/);
  assert.match(tx, /tx\.startEntry\.update\(/);
  assert.match(tx, /action: "runner\.name_changed"/);
  assert.match(tx, /oldName: plan\.oldName/);
  assert.match(tx, /rows: plan\.updates\.map/);
  assert.match(tx, /\n\s+tx,\n\s+\);/);
});

test("rename revalidates runner profile, results, stats cache", () => {
  for (const pattern of [
    /revalidatePath\("\/\[locale\]\/bezec\/\[id\]", "page"\)/,
    /revalidatePath\("\/\[locale\]\/results", "layout"\)/,
    /revalidatePath\("\/\[locale\]\/statistiky", "layout"\)/,
    /revalidateTag\(STATS_CACHE_TAG, "max"\)/,
  ]) {
    assert.match(action, pattern);
  }
});

test("runner pages are admin only; registration shortcut only for admins (Q249)", () => {
  for (const path of [
    "../../app/[locale]/admin/ciselniky/bezci/page.tsx",
    "../../app/[locale]/admin/ciselniky/bezci/[id]/page.tsx",
  ]) {
    assert.match(read(path), /await requireAdmin\(\);/, path);
  }
  const registration = read("../../app/[locale]/admin/prihlasky/[rok]/[id]/page.tsx");
  assert.match(registration, /session\.role === "admin" \? \(\s*<Link/);
  assert.match(registration, /pathname: "\/admin\/ciselniky\/bezci\/\[id\]"/);
  const dictionaries = read("../../app/[locale]/admin/ciselniky/page.tsx");
  assert.match(dictionaries, /\.\.\.\(isAdmin\s*\?\s*\[\s*\{\s*href: "\/admin\/ciselniky\/bezci"/);
});

test("resolveRunner falls back to an unambiguous previous name (Q252)", () => {
  const runner = read("../entries/runner.ts");
  const fallback = runner.indexOf("findRunnerByPreviousName(name");
  assert.ok(fallback > 0);
  assert.ok(fallback < runner.indexOf("allocateRunnerId("), "before creating a new runner");
});
