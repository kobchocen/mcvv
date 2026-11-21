import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { startListProposalLock } from "./startlist-proposal-lock";

const ROOT = new URL("../../", import.meta.url).pathname;
const source = (path: string) => readFileSync(`${ROOT}${path}`, "utf8");

/** Tělo exportované funkce ze zdrojáku (po uzavírací závorku na začátku řádku). */
function exported(code: string, name: string): string {
  const start = code.indexOf(`export async function ${name}(`);
  assert.ok(start >= 0, `${name} not found`);
  const end = code.indexOf("\n}\n", start);
  return code.slice(start, end < 0 ? undefined : end);
}

describe("start list proposal lock after the draw is confirmed", () => {
  it("locks the proposal once published or drawn (also when hidden in an emergency)", () => {
    assert.deepEqual(
      startListProposalLock({ startlistPublished: true, startlistDrawnYear: null }, 2026),
      { locked: true, reason: "published" },
    );
    assert.deepEqual(
      startListProposalLock({ startlistPublished: false, startlistDrawnYear: 2026 }, 2026),
      { locked: true, reason: "drawn" },
    );
    assert.deepEqual(
      startListProposalLock({ startlistPublished: false, startlistDrawnYear: 2025 }, 2026),
      { locked: false },
    );
  });

  it("server action refuses to apply a proposal when locked (before generating)", () => {
    const body = exported(source("lib/admin/startlist.ts"), "applyStartListProposal");
    const guard = body.indexOf("startListProposalLock(await getSiteSettings(), year)");
    assert.ok(guard > 0, "applyStartListProposal must check the draw lock");
    assert.match(body.slice(guard), /chyba: lock\.reason/);
    assert.ok(guard < body.indexOf("generateStartList("), "lock must be checked first");
    assert.ok(guard < body.indexOf("prisma.$transaction"), "lock must be checked before writes");
  });

  it("confirming the draw publishes the start list (after the writes)", () => {
    const body = exported(source("lib/admin/startlist.ts"), "applyStartListProposal");
    const confirm = body.indexOf("await confirmStartlistDraw(year)");
    assert.ok(confirm > body.indexOf("prisma.$transaction"), "publish after saving the draw");
    assert.match(body, /action: "startlist\.draw_confirmed"/);
  });

  it("manual row edits stay allowed", () => {
    const actions = source("lib/admin/startlist.ts");
    for (const name of ["setStartBib", "swapStartBibs", "toggleStartLock"]) {
      assert.doesNotMatch(exported(actions, name), /startListProposalLock/, name);
    }
  });

  it("admin page disables the button and skips the preview when locked", () => {
    const page = source("app/[locale]/admin/startovka/page.tsx");
    assert.match(page, /const proposalLock = startListProposalLock\(site, year\);/);
    assert.match(page, /const showProposal = query\.navrh === "1" && !proposalLocked;/);
    assert.match(page, /disabled=\{proposalLocked\}/);
    assert.match(page, /t\("proposeLockedPublished"\)/);
  });

  it("message exists in cs and en", () => {
    for (const locale of ["cs", "en"]) {
      const messages = JSON.parse(source(`i18n/locales/${locale}/common.json`)) as {
        StartAdmin: Record<string, string>;
      };
      assert.ok(messages.StartAdmin.proposeLockedPublished, locale);
      assert.ok(messages.StartAdmin.proposeLockedDrawn, locale);
      assert.ok(messages.StartAdmin.proposalApplyHint, locale);
    }
  });
});
