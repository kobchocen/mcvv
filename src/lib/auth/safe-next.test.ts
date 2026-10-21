import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { loginTarget, safeAdminNext, safeNext } from "./safe-next";

describe("safeNext", () => {
  it("accepts allowlisted public paths and strips the locale", () => {
    assert.equal(safeNext("/prihlasky"), "/prihlasky");
    assert.equal(safeNext("/cs/prihlasky"), "/prihlasky");
    assert.equal(safeNext("/en/navod"), "/navod");
    assert.equal(safeNext("%2Fcs%2Fprihlasky"), "/prihlasky");
    assert.equal(safeNext("/prihlasky/"), "/prihlasky");
    assert.equal(safeNext("/cs/vysledky"), "/vysledky");
  });
  it("accepts admin paths with simple query", () => {
    assert.equal(safeNext("/admin/prihlasky?rok=2026"), "/admin/prihlasky?rok=2026");
    assert.equal(safeAdminNext("/cs/admin"), "/admin");
  });
  it("rejects open redirects and unknown paths", () => {
    for (const bad of [
      "https://evil.example/",
      "//evil.example",
      "/\\evil.example",
      "\\\\evil.example",
      "%2F%2Fevil.example",
      "http:/evil",
      "javascript:alert(1)",
      "/prihlasky@evil.example",
      "/neexistuje",
      "/admin/../prihlasky",
      "/prihlasky?x=<script>",
      "prihlasky",
      "",
      null,
      42,
      "/" + "a".repeat(200),
    ]) {
      assert.equal(safeNext(bad), null, String(bad));
    }
    assert.equal(safeAdminNext("/prihlasky"), null);
  });
});

describe("loginTarget", () => {
  it("defaults to the application page", () => {
    assert.deepEqual(loginTarget(null, false), { kind: "default" });
    assert.deepEqual(loginTarget("/", false), { kind: "default" });
  });
  it("honours public next for everyone", () => {
    assert.deepEqual(loginTarget("/navod", false), { kind: "user", path: "/navod", query: "" });
  });
  it("honours admin next only for staff", () => {
    assert.deepEqual(loginTarget("/admin", true), { kind: "admin", next: "/admin" });
    assert.deepEqual(loginTarget("/admin", false), { kind: "default" });
  });
});

describe("zprávy", () => {
  it("accepts /zpravy and a thread detail, rejects other subpaths", () => {
    assert.equal(safeNext("/cs/zpravy"), "/zpravy");
    assert.equal(safeNext("/zpravy/12"), "/zpravy/12");
    assert.equal(safeNext("/zpravy/abc"), null);
    assert.equal(safeNext("/zpravy/12/x"), null);
  });
  it("thread detail is a user target", () => {
    assert.deepEqual(loginTarget("/zpravy/12", false), { kind: "thread", id: "12" });
    assert.deepEqual(loginTarget("/admin/zpravy/3", true), {
      kind: "admin",
      next: "/admin/zpravy/3",
    });
  });
});

describe("mezičasy", () => {
  it("/mezicasy is an allowed user target after login", () => {
    assert.equal(safeNext("/cs/mezicasy"), "/mezicasy");
    assert.deepEqual(loginTarget("/mezicasy", false), {
      kind: "user",
      path: "/mezicasy",
      query: "",
    });
  });
});

describe("loginTarget – Časomíra (raceday access)", () => {
  it("lands on the race-day section by default", () => {
    assert.deepEqual(loginTarget(null, "raceday"), { kind: "admin", next: "/admin/den-zavodu" });
  });
  it("honours only race-day admin paths", () => {
    assert.deepEqual(loginTarget("/admin/den-zavodu", "raceday"), {
      kind: "admin",
      next: "/admin/den-zavodu",
    });
    assert.deepEqual(loginTarget("/admin/prihlasky", "raceday"), {
      kind: "admin",
      next: "/admin/den-zavodu",
    });
  });
  it("full access and none behave like the boolean variant", () => {
    assert.deepEqual(loginTarget("/admin/platby", "full"), {
      kind: "admin",
      next: "/admin/platby",
    });
    assert.deepEqual(loginTarget("/admin/den-zavodu", "none"), { kind: "default" });
  });
});
