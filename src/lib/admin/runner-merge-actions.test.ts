import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// The actions module needs the Next.js request context, so its guards are checked in the source.
const source = readFileSync(new URL("./runner-merge-actions.ts", import.meta.url), "utf8");

function body(name: string): string {
  const start = source.indexOf(`export async function ${name}(`);
  assert.ok(start >= 0, name);
  const next = source.indexOf("\nexport async function ", start + 1);
  return source.slice(start, next < 0 ? undefined : next);
}

test("runner merge preview and apply are admin only, guarded first in the action", () => {
  for (const name of ["previewRunnerMergeAction", "mergeRunnersAction"]) {
    const firstLine = body(name).split("\n")[1] ?? "";
    assert.match(firstLine, /await requireAdmin\(\)/, name);
  }
});

test("merging needs the explicit irreversible confirmation before touching the DB", () => {
  const merge = body("mergeRunnersAction");
  const confirm = merge.indexOf('formData.get("confirm") !== "1"');
  const apply = merge.indexOf("applyRunnerMerge(");
  assert.ok(confirm > 0 && apply > confirm);
});

test("the merge page is admin only", () => {
  const page = readFileSync(
    new URL("../../app/[locale]/admin/ciselniky/bezci/slouceni/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(page, /await requireAdmin\(\);/);
});
