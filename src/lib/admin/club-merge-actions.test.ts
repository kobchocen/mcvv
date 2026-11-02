import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

// The actions module needs the Next.js request context, so its guards are checked in the source.
const source = readFileSync(new URL("./club-merge-actions.ts", import.meta.url), "utf8");
const page = readFileSync(
  new URL("../../app/[locale]/admin/ciselniky/kluby/slouceni/page.tsx", import.meta.url),
  "utf8",
);

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

test("manual preview takes the main and merged id directly (Q245)", () => {
  const preview = body("previewClubMergeAction");
  assert.match(preview, /formString\(formData, "hlavni"\)/);
  assert.match(preview, /formString\(formData, "sloucit"\)/);
  assert.match(preview, /chyba: "same"/);
  // Suggestions keep the idA / idB + "main" radio form.
  assert.match(preview, /formString\(formData, "main"\)/);
});

test("the merge page hides preview and merge controls from non-admins", () => {
  assert.match(page, /const canMerge = canMergeClubs\(session\.role\);/);
  assert.match(page, /canMerge && query\.hlavni && query\.sloucit/);
  assert.match(page, /canMerge \? \(\s*<PendingSubmitButton formAction=\{previewClubMergeAction\}/);
  // The manual picker (club list incl. names) is only built for admins.
  assert.match(page, /const pickOptions: MergePickOption\[\] = canMerge/);
});

test("every action button shows progress (Q248): no plain submit buttons are left", () => {
  assert.doesNotMatch(page, /<Button\b/);
  assert.doesNotMatch(page, /<button type="submit"/);
  for (const action of ["previewClubMergeAction", "rejectClubMerge", "confirmClubMerge"]) {
    assert.match(page, new RegExp(action));
  }
  assert.ok((page.match(/<PendingSubmitButton\b/g) ?? []).length >= 5);
});

test("suggestions are paged by 10 (Q244); performed merges incl. migration (Q246, Q247)", () => {
  assert.match(page, /const PAGE = 10;/);
  assert.match(page, /where: \{ action: "club\.merge" \}/);
  assert.match(page, /take: CLUB_MERGE_HISTORY_LIMIT/);
  // Audit link only for the admin.
  assert.match(
    page,
    /\{isAdmin \? \(\s*<td[^>]*>\s*<Link\s+href=\{\{\s*pathname: "\/admin\/audit"/,
  );
});
