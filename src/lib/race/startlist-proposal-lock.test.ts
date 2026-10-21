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

describe("start list proposal lock after publishing", () => {
  it("locks the proposal once the start list is published", () => {
    assert.deepEqual(startListProposalLock({ startlistPublished: true }), {
      locked: true,
      reason: "published",
    });
    assert.deepEqual(startListProposalLock({ startlistPublished: false }), { locked: false });
  });

  it("server action refuses to apply a proposal when published (before generating)", () => {
    const body = exported(source("lib/admin/startlist.ts"), "applyStartListProposal");
    const guard = body.indexOf("startListProposalLock(await getSiteSettings()).locked");
    assert.ok(guard > 0, "applyStartListProposal must check the publish lock");
    assert.match(body.slice(guard), /chyba: "published"/);
    assert.ok(guard < body.indexOf("generateStartList("), "lock must be checked first");
    assert.ok(guard < body.indexOf("prisma.$transaction"), "lock must be checked before writes");
  });

  it("manual row edits and the OBD import stay allowed", () => {
    const actions = source("lib/admin/startlist.ts");
    for (const name of [
      "setStartBib",
      "swapStartBibs",
      "toggleStartLock",
      "createStartGroup",
      "deleteStartGroup",
    ]) {
      assert.doesNotMatch(exported(actions, name), /startListProposalLock/, name);
    }
    assert.doesNotMatch(source("lib/raceday/import-actions.ts"), /startListProposalLock/);
  });

  it("admin page disables the button and skips the preview when locked", () => {
    const page = source("app/[locale]/admin/startovka/page.tsx");
    assert.match(page, /const proposalLocked = startListProposalLock\(site\)\.locked;/);
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
    }
  });
});
