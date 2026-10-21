import assert from "node:assert/strict";
import { test } from "node:test";

import { adminGate, adminPage, loginNextFor, loginUrl } from "./admin-gate";
import { loginTarget, safeNext } from "./safe-next";

const base = { method: "GET", isRscOrAction: false, search: "" } as const;

test("only locale-prefixed admin pages are guarded", () => {
  assert.deepEqual(adminPage("/cs/admin"), { locale: "cs", path: "/admin" });
  assert.deepEqual(adminPage("/en/admin/platby/"), { locale: "en", path: "/admin/platby" });
  assert.equal(adminPage("/cs/administrace"), null);
  assert.equal(adminPage("/cs/prihlasky"), null);
  assert.equal(adminPage("/admin"), null);
});

test("anonymous GET of an admin page gets a 307 target with next= of the original path", () => {
  const decision = adminGate({ ...base, pathname: "/cs/admin/prihlasky", cookieRole: null });
  assert.deepEqual(decision, {
    kind: "redirect",
    location: "/cs/prihlaseni?next=%2Fadmin%2Fprihlasky",
  });
  const withQuery = adminGate({
    ...base,
    pathname: "/en/admin/ciselniky/kluby",
    search: "?rok=2026",
    cookieRole: null,
  });
  assert.deepEqual(withQuery, {
    kind: "redirect",
    location: "/en/prihlaseni?next=%2Fadmin%2Fciselniky%2Fkluby%3Frok%3D2026",
  });
});

test("the next= value passes the allowed-next whitelist and leads back after login", () => {
  const decision = adminGate({
    ...base,
    pathname: "/cs/admin/prihlasky/2026/12",
    cookieRole: null,
  });
  assert.equal(decision.kind, "redirect");
  const next = new URL(
    decision.kind === "redirect" ? decision.location : "",
    "http://x",
  ).searchParams.get("next");
  assert.equal(safeNext(next), "/admin/prihlasky/2026/12");
  assert.deepEqual(loginTarget(safeNext(next), "full"), {
    kind: "admin",
    next: "/admin/prihlasky/2026/12",
  });
});

test("an unsafe query is dropped but the path is kept", () => {
  assert.equal(loginNextFor("/admin/platby", "?q=<script>"), "/admin/platby");
  assert.equal(loginNextFor("/admin/platby", ""), "/admin/platby");
  assert.equal(loginUrl("cs", null), "/cs/prihlaseni");
});

test("an account without admin access is redirected, staff and timing pass", () => {
  assert.equal(
    adminGate({ ...base, pathname: "/cs/admin", cookieRole: "registrar" }).kind,
    "redirect",
  );
  assert.deepEqual(adminGate({ ...base, pathname: "/cs/admin", cookieRole: "organizer" }), {
    kind: "pass",
    requestPath: "/admin",
  });
  assert.equal(
    adminGate({ ...base, pathname: "/cs/admin/den-zavodu", cookieRole: "timing" }).kind,
    "pass",
  );
});

test("server actions, RSC navigation and POSTs are not redirected by the proxy", () => {
  for (const input of [
    { ...base, isRscOrAction: true },
    { ...base, method: "POST" },
  ]) {
    const decision = adminGate({ ...input, pathname: "/cs/admin/platby", cookieRole: null });
    assert.deepEqual(decision, { kind: "pass", requestPath: "/admin/platby" });
  }
});

test("other pages are not touched", () => {
  assert.deepEqual(adminGate({ ...base, pathname: "/cs/prihlasky", cookieRole: null }), {
    kind: "none",
  });
});
