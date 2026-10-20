import assert from "node:assert/strict";
import { test } from "node:test";

import { renderTransactionalEmail } from "../mail/layout";
import {
  FORGOT_SENT,
  forgotAnswer,
  processForgotRequest,
  type ForgotDeps,
  type ForgotOutcome,
} from "./forgot-core";
import { RateLimiter } from "./password-reset";
import { completeSignupCore, type SignupDeps } from "./signup-core";
import {
  SIGNUP_TOKEN_TTL_MS,
  createSignupToken,
  isSignupTokenShape,
  readSignupToken,
} from "./signup-token";
import { signupInviteUrl } from "./tokens";

const SECRET = "s".repeat(40);

function forgotDeps(accounts: string[], overrides: Partial<ForgotDeps> = {}) {
  const sent: string[] = [];
  const deps: ForgotDeps = {
    perIp: new RateLimiter(10, 60_000),
    perEmail: new RateLimiter(3, 60_000),
    findAccount: async (email) =>
      accounts.includes(email) ? { id: accounts.indexOf(email) + 1, email } : null,
    sendReset: async (account) => {
      sent.push(`reset:${account.email}`);
    },
    sendSignupInvite: async (email) => {
      sent.push(`signup:${email}`);
    },
    ...overrides,
  };
  return { deps, sent };
}

test("forgot password: existing account gets the unchanged reset e-mail", async () => {
  const { deps, sent } = forgotDeps(["known@example.com"]);
  assert.equal(await processForgotRequest("known@example.com", "1.1.1.1", deps), "reset");
  assert.deepEqual(sent, ["reset:known@example.com"]);
});

test("forgot password: unknown e-mail gets the one-click sign-up invite", async () => {
  const { deps, sent } = forgotDeps(["known@example.com"]);
  assert.equal(await processForgotRequest("new@example.com", "1.1.1.1", deps), "signup");
  assert.deepEqual(sent, ["signup:new@example.com"]);
});

test("forgot password: web answer is identical for every outcome (no enumeration)", async () => {
  const { deps } = forgotDeps(["known@example.com"]);
  const known = await processForgotRequest("known@example.com", "2.2.2.2", deps);
  const unknown = await processForgotRequest("new@example.com", "2.2.2.2", deps);
  assert.deepEqual([known, unknown], ["reset", "signup"]);
  const outcomes: ForgotOutcome[] = ["ignored", "limited", "reset", "signup", "failed"];
  for (const outcome of outcomes) {
    assert.deepEqual(forgotAnswer(outcome), FORGOT_SENT);
  }
  assert.deepEqual(FORGOT_SENT, { sent: true });
  // a failing mail queue still answers the same way
  const broken = forgotDeps([], {
    sendSignupInvite: async () => {
      throw new Error("queue down");
    },
  });
  assert.equal(await processForgotRequest("x@example.com", "3.3.3.3", broken.deps), "failed");
});

test("sign-up invite e-mail links to the one-time page with the token", () => {
  const token = createSignupToken("new@example.com", SECRET);
  const url = signupInviteUrl("https://mcvv.org", "cs", token);
  assert.equal(url, `https://mcvv.org/cs/zalozeni-uctu?token=${token}`);
  assert.equal(signupInviteUrl("https://mcvv.org", "xx", token).includes("/cs/"), true);
  const { html, text } = renderTransactionalEmail({
    subject: "Účet u nás zatím nemáte – založte si ho jedním klikem",
    locale: "cs",
    site: "https://mcvv.org",
    paragraphs: ["intro"],
    action: { label: "Založit účet", url },
  });
  assert.ok(html.includes(`zalozeni-uctu?token=${token}`));
  assert.ok(text.includes(`Založit účet: ${url}`));
});

test("forgot password: rate limit per e-mail applies to both branches", async () => {
  const { deps, sent } = forgotDeps(["known@example.com"]);
  for (let i = 0; i < 3; i++) {
    assert.equal(await processForgotRequest("new@example.com", `10.0.0.${i}`, deps), "signup");
  }
  assert.equal(await processForgotRequest("new@example.com", "10.0.0.9", deps), "limited");
  for (let i = 0; i < 3; i++) {
    await processForgotRequest("known@example.com", `10.0.1.${i}`, deps);
  }
  assert.equal(await processForgotRequest("known@example.com", "10.0.1.9", deps), "limited");
  assert.equal(sent.length, 6);
});

test("forgot password: rate limit per IP across different e-mails", async () => {
  const { deps, sent } = forgotDeps([], { perIp: new RateLimiter(2, 60_000) });
  assert.equal(await processForgotRequest("a@example.com", "9.9.9.9", deps), "signup");
  assert.equal(await processForgotRequest("b@example.com", "9.9.9.9", deps), "signup");
  assert.equal(await processForgotRequest("c@example.com", "9.9.9.9", deps), "limited");
  assert.equal(await processForgotRequest("c@example.com", "8.8.8.8", deps), "signup");
  assert.equal(sent.length, 3);
});

test("sign-up token: sealed, bound to the e-mail and time-limited", () => {
  const now = 1_700_000_000_000;
  const token = createSignupToken(" New@Example.com ", SECRET, now);
  assert.ok(isSignupTokenShape(token));
  assert.deepEqual(readSignupToken(token, SECRET, now + 1000), {
    email: "new@example.com",
    expiresAt: now + SIGNUP_TOKEN_TTL_MS,
  });
  assert.equal(readSignupToken(token, SECRET, now + SIGNUP_TOKEN_TTL_MS + 1), null, "expired");
  assert.equal(readSignupToken(token, "x".repeat(40), now), null, "other secret");
  assert.ok(
    !Buffer.from(token, "base64url").toString("latin1").includes("example"),
    "e-mail not readable",
  );
  const raw = Buffer.from(token, "base64url");
  raw[14] ^= 1;
  assert.equal(readSignupToken(raw.toString("base64url"), SECRET, now), null, "tampered");
  assert.equal(readSignupToken("garbage", SECRET, now), null);
  assert.equal(readSignupToken(undefined, SECRET, now), null);
  assert.notEqual(
    createSignupToken("a@b.cz", SECRET, now),
    createSignupToken("a@b.cz", SECRET, now),
  );
});

function signupDeps(now: number) {
  const accounts = new Map<string, number>();
  const deps: SignupDeps = {
    secret: SECRET,
    now,
    accountExists: async (email) => accounts.has(email),
    createAccount: async ({ email, name }) => {
      if (accounts.has(email)) throw new Error("unique");
      accounts.set(email, accounts.size + 1);
      return { id: accounts.size, email, name, role: "registrar" };
    },
  };
  return { deps, accounts };
}

const form = (token: string) => ({
  token,
  name: "Jana Nováková",
  clubName: "",
  password: "dlouhe-heslo",
  confirm: "dlouhe-heslo",
});

test("sign-up link creates a verified registrar account once (one-time use)", async () => {
  const now = Date.now();
  const token = createSignupToken("new@example.com", SECRET, now);
  const { deps, accounts } = signupDeps(now + 60_000);
  const first = await completeSignupCore(form(token), deps);
  assert.ok("account" in first);
  assert.equal(first.account.email, "new@example.com");
  assert.equal(first.account.role, "registrar");
  assert.equal(accounts.size, 1);
  assert.deepEqual(await completeSignupCore(form(token), deps), { error: "used" });
  assert.equal(accounts.size, 1);
});

test("sign-up link: concurrent second use loses on the unique e-mail", async () => {
  const now = Date.now();
  const token = createSignupToken("race@example.com", SECRET, now);
  const { deps, accounts } = signupDeps(now);
  accounts.set("race@example.com", 1);
  const racing: SignupDeps = { ...deps, accountExists: async () => false };
  assert.deepEqual(await completeSignupCore(form(token), racing), { error: "used" });
});

test("sign-up link: expired or invalid token and bad input are rejected", async () => {
  const now = Date.now();
  const token = createSignupToken("late@example.com", SECRET, now);
  const late = signupDeps(now + SIGNUP_TOKEN_TTL_MS + 1);
  assert.deepEqual(await completeSignupCore(form(token), late.deps), { error: "invalid" });
  assert.equal(late.accounts.size, 0);
  const { deps } = signupDeps(now);
  assert.deepEqual(await completeSignupCore(form("nope"), deps), { error: "invalid" });
  assert.deepEqual(await completeSignupCore({ ...form(token), name: "  " }, deps), {
    error: "name",
  });
  assert.deepEqual(
    await completeSignupCore({ ...form(token), password: "short", confirm: "short" }, deps),
    { error: "short" },
  );
  assert.deepEqual(await completeSignupCore({ ...form(token), confirm: "jine-heslo1" }, deps), {
    error: "mismatch",
  });
});
