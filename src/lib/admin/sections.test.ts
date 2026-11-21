import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, it } from "node:test";

import {
  canAccessRaceDay,
  hasAdminHome,
  isStaffRole,
  USER_ROLES,
  type UserRole,
} from "@/lib/auth/roles";

import { ADMIN_SECTIONS, backHref, locate, navTree, visibleSections } from "./sections";

const ADMIN_DIR = join(process.cwd(), "src", "app", "[locale]", "admin");

/** Všechny admin stránky jako cesty (`/admin/prihlasky/[rok]/[id]`) se zdrojem. */
function adminPages(): { path: string; source: string }[] {
  const pages: { path: string; source: string }[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name === "page.tsx") {
        const rel = relative(ADMIN_DIR, dir).split(sep).filter(Boolean).join("/");
        pages.push({ path: rel ? `/admin/${rel}` : "/admin", source: readFileSync(full, "utf8") });
      }
    }
  };
  walk(ADMIN_DIR);
  return pages;
}

const isAdmin = (role: UserRole) => role === "admin";

function guardOf(source: string): ((role: UserRole) => boolean) | null {
  if (source.includes("requireAdmin()")) return isAdmin;
  if (source.includes("requireRaceDay()")) return canAccessRaceDay;
  if (source.includes("requireStaff()")) return isStaffRole;
  return null;
}

function allItems() {
  return ADMIN_SECTIONS.flatMap((group) =>
    group.chapters.flatMap((chapter) => [
      ...(chapter.href ? [{ id: chapter.id, href: chapter.href, allowed: chapter.allowed! }] : []),
      ...(chapter.children ?? []),
    ]),
  );
}

describe("admin sections registry", () => {
  it("every admin page has its place in the navigation", () => {
    for (const page of adminPages()) {
      assert.ok(locate(page.path), `${page.path} is not covered by ADMIN_SECTIONS`);
    }
  });

  it("navigation items mirror today's page guards (no hidden page, no dead link)", () => {
    const pages = new Map(adminPages().map((page) => [page.path, page.source]));
    for (const item of allItems()) {
      if (!item.href.startsWith("/admin") || item.href === "/admin") continue;
      const source = pages.get(item.href);
      assert.ok(source, `${item.href} has no page`);
      const guard = guardOf(source);
      assert.ok(guard, `${item.href} has no recognised guard`);
      for (const role of USER_ROLES) {
        assert.equal(item.allowed(role), guard(role), `${item.id} for ${role}`);
      }
    }
  });

  it("ids are unique", () => {
    const ids = ADMIN_SECTIONS.flatMap((group) =>
      group.chapters.flatMap((chapter) => [
        chapter.id,
        ...(chapter.children ?? []).map((c) => c.id),
      ]),
    );
    assert.equal(new Set(ids).size, ids.length);
  });

  it("a runner sees nothing, every other role at least the overview", () => {
    assert.deepEqual(visibleSections("registrar"), []);
    for (const role of USER_ROLES.filter(hasAdminHome)) {
      const first = visibleSections(role)[0]?.chapters[0];
      assert.equal(first?.id, "overview", role);
    }
  });

  it("race-day roles see only their screens", () => {
    const ids = (role: UserRole) =>
      visibleSections(role).flatMap((group) =>
        group.chapters.flatMap((chapter) => [
          chapter.id,
          ...(chapter.children ?? []).map((c) => c.id),
        ]),
      );
    assert.deepEqual(ids("splitmaker"), ["overview", "screens", "screens.splits"]);
    assert.deepEqual(ids("starter"), ["overview", "screens", "screens.starter"]);
    assert.deepEqual(ids("race_office"), [
      "overview",
      "raceOffice",
      "raceOffice.cash",
      "raceOffice.sales",
    ]);
    assert.deepEqual(ids("timing"), ["overview", "raceControl", "raceControl.overview"]);
  });

  it("organizer misses only the admin-only items", () => {
    const ids = visibleSections("organizer").flatMap((group) =>
      group.chapters.flatMap((chapter) => [
        chapter.id,
        ...(chapter.children ?? []).map((c) => c.id),
      ]),
    );
    for (const hidden of [
      "users",
      "settings",
      "audit",
      "raceControl.manual",
      "dictionaries.runners",
      "raceOffice.items",
    ]) {
      assert.ok(!ids.includes(hidden), hidden);
    }
    assert.ok(ids.includes("entries.payments"));
    assert.equal(visibleSections("organizer").at(-1)?.id, "data");
  });

  it("a chapter without its own page links to its first visible subsection", () => {
    const raceControl = visibleSections("timing")
      .flatMap((group) => group.chapters)
      .find((chapter) => chapter.id === "raceControl");
    assert.equal(raceControl?.href, "/admin/den-zavodu");
  });
});

describe("locate and back", () => {
  it("finds the longest match and marks detail pages", () => {
    assert.equal(locate("/admin/prihlasky/spec-starty")?.subsectionId, "entries.special");
    assert.deepEqual(locate("/admin/prihlasky/2026/173"), {
      groupId: "race",
      chapterId: "entries",
      chapterHref: undefined,
      subsectionId: "entries.list",
      subsectionHref: "/admin/prihlasky",
      deeper: true,
    });
    assert.equal(locate("/admin/den-zavodu/zive/casy")?.subsectionId, "raceControl.manual");
    assert.equal(locate("/admin/ciselniky")?.chapterId, "dictionaries");
    assert.equal(locate("/admin/ciselniky")?.subsectionId, undefined);
    assert.equal(locate("/admin")?.chapterId, "overview");
    assert.equal(locate("/admin-x"), null);
  });

  it("back goes one level up by the registry", () => {
    assert.equal(backHref("/admin"), null);
    assert.equal(backHref("/admin/platby"), "/admin");
    assert.equal(backHref("/admin/prihlasky/2026/173"), "/admin/prihlasky");
    assert.equal(backHref("/admin/ciselniky/kluby"), "/admin/ciselniky");
    assert.equal(backHref("/admin/ciselniky/kluby/slouceni"), "/admin/ciselniky/kluby");
    assert.equal(backHref("/admin/ciselniky"), "/admin");
    assert.equal(backHref("/admin/partneri/12?x=1"), "/admin/partneri");
  });

  it("works on the serialized tree as well", () => {
    const tree = navTree(visibleSections("admin"), (key) => key, { unreadMessages: 3 });
    assert.equal(tree[0]?.chapters.find((chapter) => chapter.id === "messages")?.badge, 3);
    assert.equal(backHref("/admin/newsletter/novy", tree), "/admin/newsletter");
    assert.equal(locate("/admin/tisk", tree)?.subsectionId, "startlist.print");
  });
});
