import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// The actions module needs the Next.js request context, so its guards are checked in the source.
const source = readFileSync(new URL("./club-merge-actions.ts", import.meta.url), "utf8");

function body(name: string): string {
  const start = source.indexOf(`export async function ${name}(`);
  assert.ok(start >= 0, name);
  const next = source.indexOf("\nexport async function ", start + 1);
  return source.slice(start, next < 0 ? undefined : next);
}

test("club merge preview and apply are admin only (Q47), guarded first in the action", () => {
  for (const name of ["previewClubMergeAction", "confirmClubMerge"]) {
    const firstLine = body(name).split("\n")[1] ?? "";
    assert.match(firstLine, /await requireAdmin\(\)/, name);
  }
});

test("rejecting / restoring a suggestion stays allowed to staff (organizer)", () => {
  for (const name of ["rejectClubMerge", "restoreClubMerge"]) {
    assert.match(body(name), /await requireStaff\(\)/, name);
  }
});

test("the merge page hides preview and merge controls from non-admins", () => {
  const page = readFileSync(
    new URL("../../app/[locale]/admin/ciselniky/kluby/slouceni/page.tsx", import.meta.url),
    "utf8",
  );
  assert.match(page, /const canMerge = canMergeClubs\(session\.role\);/);
  assert.match(page, /canMerge && query\.hlavni && query\.sloucit/);
  assert.match(
    page,
    /canMerge \? \(\s*<Button type="submit" formAction=\{previewClubMergeAction\}/,
  );
});
