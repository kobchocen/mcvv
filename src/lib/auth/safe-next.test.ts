import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { loginTarget, postLoginTarget, safeAdminNext, safeNext } from "./safe-next";

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
  it("/mezicasy/speaker is an allowed target after login (#188)", () => {
    assert.equal(safeNext("/cs/mezicasy/speaker"), "/mezicasy/speaker");
    assert.deepEqual(loginTarget("/mezicasy/speaker", "full"), {
      kind: "user",
      path: "/mezicasy/speaker",
      query: "",
    });
  });
});

describe("loginTarget – Časomíra (raceday access)", () => {
  it("lands on the race homepage by default (no jump into the race-day section)", () => {
    assert.deepEqual(loginTarget(null, "raceday"), { kind: "home" });
  });
  it("honours the /admin home and race-day admin paths only", () => {
    assert.deepEqual(loginTarget("/admin/den-zavodu", "raceday"), {
      kind: "admin",
      next: "/admin/den-zavodu",
    });
    assert.deepEqual(loginTarget("/admin", "raceday"), { kind: "admin", next: "/admin" });
    assert.deepEqual(loginTarget("/admin/obrazovky", "raceday"), {
      kind: "admin",
      next: "/admin/obrazovky",
    });
    assert.deepEqual(loginTarget("/admin/prihlasky", "raceday"), { kind: "home" });
  });
  it("full access and none behave like the boolean variant", () => {
    assert.deepEqual(loginTarget("/admin/platby", "full"), {
      kind: "admin",
      next: "/admin/platby",
    });
    assert.deepEqual(loginTarget("/admin/den-zavodu", "none"), { kind: "default" });
  });
});

describe("loginTarget – default target (no next, Pavel 21. 11.)", () => {
  it("sends every staff role to the race homepage", () => {
    assert.deepEqual(loginTarget(null, "full"), { kind: "home" });
    assert.deepEqual(loginTarget("/", true), { kind: "home" });
    assert.deepEqual(loginTarget(null, "raceday"), { kind: "home" });
    assert.deepEqual(loginTarget(null, "tools"), { kind: "home" });
  });
  it("keeps the application page for runners", () => {
    assert.deepEqual(loginTarget(null, "none"), { kind: "default" });
  });
  it("tools roles may follow next to the /admin home and their hubs, not other admin pages", () => {
    assert.deepEqual(loginTarget("/admin", "tools"), { kind: "admin", next: "/admin" });
    assert.deepEqual(loginTarget("/admin/obrazovky", "tools"), {
      kind: "admin",
      next: "/admin/obrazovky",
    });
    assert.deepEqual(loginTarget("/admin/kancelar", "tools"), {
      kind: "admin",
      next: "/admin/kancelar",
    });
    assert.deepEqual(loginTarget("/admin/platby", "tools"), { kind: "home" });
  });
  it("an explicit next still wins", () => {
    assert.deepEqual(loginTarget("/prihlasky", "full"), {
      kind: "user",
      path: "/prihlasky",
      query: "",
    });
    assert.deepEqual(loginTarget("/navod", "tools"), {
      kind: "user",
      path: "/navod",
      query: "",
    });
    assert.deepEqual(loginTarget("/kancelar/polozky", "full"), {
      kind: "user",
      path: "/kancelar/polozky",
      query: "",
    });
    assert.equal(safeNext("/cs/kancelar/prodejky"), "/kancelar/prodejky");
  });
});

describe("resultboard", () => {
  it("/resultboard and TV 1–4 are allowed targets after login", () => {
    assert.equal(safeNext("/cs/resultboard"), "/resultboard");
    assert.equal(safeNext("/resultboard/1"), "/resultboard/1");
    assert.equal(safeNext("/cs/resultboard/4?test=1"), "/resultboard/4?test=1");
    assert.deepEqual(loginTarget("/resultboard", "full"), {
      kind: "user",
      path: "/resultboard",
      query: "",
    });
    assert.deepEqual(loginTarget("/resultboard/2?test=1", "full"), {
      kind: "resultboard",
      tv: "2",
      query: "test=1",
    });
  });
  it("rejects unknown resultboard paths", () => {
    assert.equal(safeNext("/resultboard/5"), null);
    assert.equal(safeNext("/resultboard/0"), null);
    assert.equal(safeNext("/resultboard/tv"), null);
    assert.equal(safeNext("/resultboard/1/x"), null);
  });
});

describe("postLoginTarget – resultboard role", () => {
  it("lands on /resultboard when there is no next", () => {
    assert.deepEqual(postLoginTarget(null, "resultboard"), {
      kind: "user",
      path: "/resultboard",
      query: "",
    });
    assert.deepEqual(postLoginTarget("/", "resultboard"), {
      kind: "user",
      path: "/resultboard",
      query: "",
    });
  });
  it("honours a resultboard next including a TV and test mode", () => {
    assert.deepEqual(postLoginTarget("/resultboard", "resultboard"), {
      kind: "user",
      path: "/resultboard",
      query: "",
    });
    assert.deepEqual(postLoginTarget("/resultboard/1", "resultboard"), {
      kind: "resultboard",
      tv: "1",
      query: "",
    });
    assert.deepEqual(postLoginTarget("/resultboard/2?test=1", "resultboard"), {
      kind: "resultboard",
      tv: "2",
      query: "test=1",
    });
  });
  it("does not follow admin or other staff next", () => {
    assert.deepEqual(postLoginTarget("/admin", "resultboard"), {
      kind: "user",
      path: "/resultboard",
      query: "",
    });
    assert.deepEqual(postLoginTarget("/admin/obrazovky", "resultboard"), {
      kind: "user",
      path: "/resultboard",
      query: "",
    });
    assert.deepEqual(postLoginTarget("/mezicasy/speaker", "resultboard"), {
      kind: "user",
      path: "/resultboard",
      query: "",
    });
  });
  it("does not change the default for a runner or staff", () => {
    assert.deepEqual(postLoginTarget(null, "registrar"), { kind: "default" });
    assert.deepEqual(postLoginTarget(null, "admin"), { kind: "home" });
    assert.deepEqual(postLoginTarget(null, "organizer"), { kind: "home" });
  });
});
