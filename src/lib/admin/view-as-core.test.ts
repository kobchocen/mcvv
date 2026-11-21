import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  decodeViewAs,
  encodeViewAs,
  parseViewAsRoles,
  regularProxyPath,
  VIEW_AS_LEGACY_ROLES,
  VIEW_AS_ROUTE,
  VIEW_AS_V2_ROLES,
  viewAsBlocks,
  viewAsFor,
  viewAsSessionRole,
} from "./view-as-core";

const SECRET = "x".repeat(40);
const NOW = Date.UTC(2026, 11, 6, 9, 0, 0);
const exp = Math.floor(NOW / 1000) + 3600;

describe("view as role (cookie)", () => {
  it("round-trips a signed payload and rejects tampering, expiry and other secrets", () => {
    const token = encodeViewAs({ uid: 7, mode: "v2", roles: ["speaker", "entries"], exp }, SECRET);
    assert.deepEqual(decodeViewAs(token, SECRET, NOW), {
      uid: 7,
      mode: "v2",
      roles: ["entries", "speaker"],
      exp,
    });
    assert.equal(decodeViewAs(token, "y".repeat(40), NOW), null);
    assert.equal(decodeViewAs(token, SECRET, (exp + 1) * 1000), null);
    const [body, sig] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ uid: 1, mode: "v2", roles: ["speaker"], exp }),
    ).toString("base64url");
    assert.equal(decodeViewAs(`${forged}.${sig}`, SECRET, NOW), null);
    assert.equal(decodeViewAs(`${body}`, SECRET, NOW), null);
  });

  it("never previews admin or the runner role, roles depend on the mode", () => {
    assert.ok(!VIEW_AS_LEGACY_ROLES.includes("admin"));
    assert.ok(!VIEW_AS_LEGACY_ROLES.includes("registrar"));
    assert.ok(!(VIEW_AS_V2_ROLES as readonly string[]).includes("admin"));
    assert.deepEqual(parseViewAsRoles(["admin", "organizer", "speaker", "organizer"], "legacy"), [
      "organizer",
    ]);
    assert.deepEqual(parseViewAsRoles(["admin", "timing", "speaker", 5], "v2"), ["speaker"]);
    const onlyAdmin = encodeViewAs({ uid: 7, mode: "legacy", roles: ["admin"], exp }, SECRET);
    assert.equal(decodeViewAs(onlyAdmin, SECRET, NOW), null);
  });

  it("applies only to the same account and permission mode", () => {
    const payload = { uid: 7, mode: "legacy" as const, roles: ["timing"], exp };
    assert.equal(viewAsFor(payload, 7, "legacy"), payload);
    assert.equal(viewAsFor(payload, 8, "legacy"), null);
    assert.equal(viewAsFor(payload, 7, "v2"), null);
    assert.equal(viewAsFor(null, 7, "legacy"), null);
  });

  it("maps the preview to a single column role", () => {
    assert.equal(viewAsSessionRole("legacy", ["splitmaker", "timing"]), "timing");
    assert.equal(viewAsSessionRole("legacy", ["organizer", "starter"]), "organizer");
    assert.equal(viewAsSessionRole("v2", ["speaker"]), "registrar");
    assert.equal(viewAsSessionRole("v2", ["organizer_legacy", "speaker"]), "organizer");
  });
});

describe("view as role (proxy write block)", () => {
  it("blocks every write except the view-as route", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "post"]) {
      assert.equal(viewAsBlocks(method, "/cs/admin/nastaveni"), true, method);
      assert.equal(viewAsBlocks(method, "/api/live/splits"), true, method);
    }
    for (const method of ["GET", "HEAD", "OPTIONS"]) {
      assert.equal(viewAsBlocks(method, "/cs/admin"), false, method);
    }
    assert.equal(viewAsBlocks("POST", VIEW_AS_ROUTE), false);
  });

  it("keeps the regular proxy paths identical to the matcher", () => {
    for (const path of ["/", "/registrace", "/cs/admin", "/en/admin/nastaveni", "/cs/bezec/12"]) {
      assert.equal(regularProxyPath(path), true, path);
    }
    for (const path of [
      "/cs",
      "/cs/prihlasky",
      "/api/admin/view-as",
      "/_next/static/a.js",
      "/favicon.ico",
      "/healthz",
    ]) {
      assert.equal(regularProxyPath(path), false, path);
    }
  });

  it("proxy runs on every path only while the view-as cookie exists", () => {
    const proxy = readFileSync("src/proxy.ts", "utf8");
    assert.match(
      proxy,
      /\{ source: "\/:path\*", has: \[\{ type: "cookie", key: "mcvv_view_as" \}\] \}/,
    );
    assert.match(proxy, /viewAsBlocks\(request\.method, pathname\)/);
    assert.match(proxy, /status: 403/);
  });

  it("route is admin-only, origin-checked and audits start and end", () => {
    const route = readFileSync("src/app/api/admin/view-as/route.ts", "utf8");
    assert.match(route, /realAdminSession\(\)/);
    assert.match(route, /sameOrigin\(origin/);
    assert.match(route, /"permissions\.view_as_started"/);
    assert.match(route, /"permissions\.view_as_ended"/);
    const layout = readFileSync("src/app/[locale]/admin/layout.tsx", "utf8");
    assert.match(layout, /access\.preview[\s\S]*McvvAdminViewAsBar/);
  });
});
