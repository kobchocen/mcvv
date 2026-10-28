import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createTranslator } from "next-intl";

import cs from "@/i18n/locales/cs/common.json";
import en from "@/i18n/locales/en/common.json";
import { USER_ROLES } from "@/lib/auth/roles";

import {
  deliverRoleChangeMail,
  isRoleChangeMailOutcome,
  renderRoleChangeMail,
  roleChangeMailUrl,
  shouldSendRoleChangeMail,
  type RoleChange,
  type RoleChangeMailDeps,
  type RoleChangeMailTranslate,
} from "./role-change-mail";

const SITE = "https://www.mcvv.org";

function translator(locale: "cs" | "en"): RoleChangeMailTranslate {
  const t = createTranslator({
    locale,
    messages: locale === "en" ? en : cs,
    namespace: "RoleChangeMail",
  });
  return (key, values) => t(key, values);
}

const change: RoleChange = {
  email: "jana@example.com",
  name: "Jana Nováková",
  from: "registrar",
  to: "organizer",
};

type Sent = Parameters<RoleChangeMailDeps["send"]>[0];

function deps(overrides: Partial<RoleChangeMailDeps> = {}) {
  const sent: Sent[] = [];
  const value: RoleChangeMailDeps = {
    site: SITE,
    translator: async (locale) => translator(locale === "en" ? "en" : "cs"),
    send: async (mail) => {
      sent.push(mail);
      return "sent";
    },
    ...overrides,
  };
  return { sent, deps: value };
}

describe("role change e-mail (#191)", () => {
  it("is sent only when the role actually changed", () => {
    assert.equal(shouldSendRoleChangeMail({ from: "registrar", to: "organizer" }), true);
    assert.equal(shouldSendRoleChangeMail({ from: "organizer", to: "registrar" }), true);
    assert.equal(shouldSendRoleChangeMail({ from: "admin", to: "admin" }), false);
  });

  it("links to the section the new role opens", () => {
    assert.equal(roleChangeMailUrl(SITE, "cs", "organizer"), `${SITE}/cs/admin`);
    assert.equal(roleChangeMailUrl(SITE, "en", "admin"), `${SITE}/en/admin`);
    assert.equal(roleChangeMailUrl(`${SITE}/`, "cs", "timing"), `${SITE}/cs/admin/den-zavodu`);
    assert.equal(roleChangeMailUrl(SITE, "cs", "splitmaker"), `${SITE}/cs/mezicasy`);
    assert.equal(roleChangeMailUrl(SITE, "cs", "race_office"), `${SITE}/cs/kancelar`);
    assert.equal(roleChangeMailUrl(SITE, "xx", "registrar"), `${SITE}/cs/prihlasky`);
  });

  it("has cs and en texts for every role", () => {
    for (const locale of ["cs", "en"] as const) {
      const t = translator(locale);
      for (const role of USER_ROLES) {
        for (const key of [`role_${role}`, `about_${role}`, `action_${role}`] as const) {
          const value = t(key);
          assert.ok(value && !value.includes("RoleChangeMail"), `${locale} ${key}`);
        }
      }
    }
  });

  it("renders new and previous role, what the role allows and a link (cs)", () => {
    const mail = renderRoleChangeMail({ change, locale: "cs", site: SITE, t: translator("cs") });
    assert.equal(mail.subject, "MCVV: vaše role na webu je nyní „Pořadatel“");
    assert.match(mail.text, /Dobrý den, Jana Nováková,/);
    assert.match(mail.text, /jana@example\.com z „Přihlašující“ na „Pořadatel“/);
    assert.match(mail.text, /plný přístup do administrace/);
    assert.match(mail.text, /Otevřít administraci: https:\/\/www\.mcvv\.org\/cs\/admin/);
    assert.match(mail.html, /<html lang="cs">/);
    assert.match(mail.html, /href="https:\/\/www\.mcvv\.org\/cs\/admin"/);
  });

  it("renders in English and escapes the name in HTML", () => {
    const mail = renderRoleChangeMail({
      change: { ...change, name: "<b>Jane</b>", from: "splitmaker", to: "registrar" },
      locale: "en",
      site: SITE,
      t: translator("en"),
    });
    assert.match(mail.subject, /your role on the website is now “Registrant”/);
    assert.match(mail.text, /from “Split times” to “Registrant”/);
    assert.match(mail.text, /My entries: https:\/\/www\.mcvv\.org\/en\/prihlasky/);
    assert.match(mail.html, /<html lang="en">/);
    assert.ok(!mail.html.includes("<b>Jane</b>"));
    assert.match(mail.html, /&lt;b&gt;Jane&lt;\/b&gt;/);
  });

  it("sends to the user and returns the queue result", async () => {
    const { sent, deps: d } = deps({ send: async (mail) => (sent.push(mail), "queued") });
    assert.equal(await deliverRoleChangeMail(change, "cs", d), "queued");
    assert.equal(sent.length, 1);
    assert.equal(sent[0].to, "jana@example.com");
  });

  it("does not send when the role did not change", async () => {
    const { sent, deps: d } = deps();
    assert.equal(await deliverRoleChangeMail({ ...change, to: "registrar" }, "cs", d), "skipped");
    assert.equal(sent.length, 0);
  });

  it("outside production goes to the redirect address with a test subject", async () => {
    const { sent, deps: d } = deps({ redirectTo: "poradatel@example.com" });
    assert.equal(await deliverRoleChangeMail(change, "cs", d), "sent");
    assert.equal(sent[0].to, "poradatel@example.com");
    assert.match(sent[0].subject, /^\[TEST – pro jana@…\] MCVV:/);
  });

  it("never throws: a failing send or render is reported as failed", async () => {
    const errors: unknown[] = [];
    const failing = deps({
      send: async () => {
        throw new Error("network down");
      },
      onError: (error) => errors.push(error),
    });
    assert.equal(await deliverRoleChangeMail(change, "cs", failing.deps), "failed");
    assert.equal(errors.length, 1);
    const broken = deps({
      translator: async () => {
        throw new Error("missing messages");
      },
    });
    assert.equal(await deliverRoleChangeMail(change, "cs", broken.deps), "failed");
    const rejected = deps({ send: async () => "failed" });
    assert.equal(await deliverRoleChangeMail(change, "cs", rejected.deps), "failed");
  });

  it("recognizes outcomes from the query string", () => {
    assert.equal(isRoleChangeMailOutcome("queued"), true);
    assert.equal(isRoleChangeMailOutcome("nope"), false);
    assert.equal(isRoleChangeMailOutcome(undefined), false);
  });
});
