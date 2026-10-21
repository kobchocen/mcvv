import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildAudience,
  currentEntrantEmails,
  effectivePromotionOptOut,
  latestPromotionOptOuts,
  promotionOptOuts,
  legacyFromYear,
  normalizeEmail,
  processBatch,
  renderMarkdown,
  renderNewsletter,
  unsubscribeHeaders,
  unsubscribeUrl,
  type NewsletterStore,
  type OutgoingMessage,
  type RecipientCounts,
} from "./core";
import { applyUnsubscribe } from "./unsubscribe";

test("normalizeEmail trims, lowercases and rejects invalid", () => {
  assert.equal(normalizeEmail("  Jan.Novak@Example.CZ "), "jan.novak@example.cz");
  assert.equal(normalizeEmail("bez-zavinace"), null);
  assert.equal(normalizeEmail("a@b"), null);
  assert.equal(normalizeEmail("a..b@x.cz"), null);
  assert.equal(normalizeEmail("a b@x.cz"), null);
  assert.equal(normalizeEmail(null), null);
});

test("buildAudience dedupes across sources and excludes unsubscribed", () => {
  const sources = {
    userEmails: ["A@x.cz", "b@x.cz", null],
    legacyEmails: ["a@x.cz", " c@x.cz", "spatny", "D@x.cz", "d@x.cz"],
    unsubscribed: ["C@X.cz"],
  };
  const both = buildAudience(sources, { users: true, years: 3 });
  assert.deepEqual(both.emails, ["a@x.cz", "b@x.cz", "d@x.cz"]);
  assert.equal(both.users, 2);
  assert.equal(both.legacy, 2);
  assert.equal(both.excluded, 1);

  const usersOnly = buildAudience(sources, { users: true, years: 0 });
  assert.deepEqual(usersOnly.emails, ["a@x.cz", "b@x.cz"]);
  const legacyOnly = buildAudience(sources, { users: false, years: 5 });
  assert.deepEqual(legacyOnly.emails, ["a@x.cz", "d@x.cz"]);
  assert.deepEqual(buildAudience(sources, { users: false, years: 0 }).emails, []);
});

test("latestPromotionOptOuts: latest application per email decides", () => {
  const r = (email: string, year: number, promotion: string | null, id = 1) => ({
    email,
    year,
    promotion,
    id,
    created: null,
  });
  const out = latestPromotionOptOuts([
    r("A@x.cz", 2015, "N"),
    r("a@x.cz", 2022, ""), // later consent re-enables
    r("b@x.cz", 2019, null),
    r("b@x.cz", 2023, "N"), // latest says N
    r("c@x.cz", 2020, "N", 1),
    r("c@x.cz", 2020, null, 2), // same year, higher id wins
    r("d@x.cz", 2018, " n "),
  ]);
  assert.deepEqual([...out].sort(), ["b@x.cz", "d@x.cz"]);
});

test("buildAudience excludes promotion opt-outs from users and legacy", () => {
  const a = buildAudience(
    {
      userEmails: ["u@x.cz", "n@x.cz"],
      legacyEmails: ["l@x.cz", "N@x.cz", "o@x.cz"],
      unsubscribed: ["o@x.cz"],
      noPromotion: ["n@x.cz"],
    },
    { users: true, years: 10 },
  );
  assert.deepEqual(a.emails, ["l@x.cz", "u@x.cz"]);
  assert.equal(a.excluded, 2);
  assert.equal(a.noPromotion, 1);
  assert.equal(a.users, 1);
  assert.equal(a.legacy, 1);
});

test("legacyFromYear counts the current year", () => {
  const now = new Date("2026-10-17T00:00:00Z");
  assert.equal(legacyFromYear(1, now), 2026);
  assert.equal(legacyFromYear(3, now), 2024);
});

test("renderMarkdown escapes HTML and allows only safe links", () => {
  const html = renderMarkdown(
    "# Ahoj\n\n**tučně** <script>x</script>\n\n- a\n- b\n\n[web](https://mcvv.org) [x](javascript:alert(1))",
  );
  assert.match(html, /<h2[^>]*>Ahoj<\/h2>/);
  assert.match(html, /<strong>tučně<\/strong> &lt;script&gt;/);
  assert.match(html, /<ul[^>]*><li>a<\/li><li>b<\/li><\/ul>/);
  assert.match(html, /<a href="https:\/\/mcvv.org"/);
  assert.doesNotMatch(html, /href="javascript/);
});

test("rendered newsletter always contains the unsubscribe link", () => {
  const url = unsubscribeUrl("https://mcvv.org/", "a".repeat(64));
  assert.equal(url, `https://mcvv.org/cs/newsletter/odhlasit?token=${"a".repeat(64)}`);
  const mail = renderNewsletter({
    subject: "Test",
    body: "Ahoj",
    unsubscribeUrl: url,
    siteUrl: "https://mcvv.org",
  });
  assert.ok(mail.html.includes(url));
  assert.ok(mail.text.includes(url));
  const headers = unsubscribeHeaders("https://mcvv.org", "t");
  assert.equal(
    headers["List-Unsubscribe"],
    "<https://mcvv.org/api/newsletter/unsubscribe?token=t>",
  );
  assert.equal(headers["List-Unsubscribe-Post"], "List-Unsubscribe=One-Click");
});

test("applyUnsubscribe is idempotent and keeps the first timestamp", async () => {
  const rows = new Map([["tok", { unsubscribedAt: null as Date | null }]]);
  const store = {
    find: async (token: string) => rows.get(token) ?? null,
    mark: async (token: string, at: Date) => {
      rows.get(token)!.unsubscribedAt = at;
    },
  };
  const first = new Date("2026-01-01");
  assert.equal(await applyUnsubscribe(store, "tok", first), "unsubscribed");
  assert.equal(await applyUnsubscribe(store, "tok", new Date("2026-02-01")), "already");
  assert.equal(rows.get("tok")!.unsubscribedAt, first);
  assert.equal(await applyUnsubscribe(store, "nope", first), "invalid");
});

type Row = { id: number; email: string; status: string; claim?: string; claimedAt?: Date };

function memoryStore(emails: string[], unsub: string[] = []) {
  const rows: Row[] = emails.map((email, i) => ({ id: i + 1, email, status: "pending" }));
  const store: NewsletterStore = {
    async claim(_c, limit, token, now) {
      const picked = rows.filter((r) => r.status === "pending").slice(0, limit);
      for (const r of picked) Object.assign(r, { status: "sending", claim: token, claimedAt: now });
      return picked.map((r) => ({ id: r.id, email: r.email }));
    },
    async failStale(_c, olderThan) {
      let n = 0;
      for (const r of rows) {
        if (r.status === "sending" && r.claimedAt! < olderThan) {
          r.status = "failed";
          n += 1;
        }
      }
      return n;
    },
    async unsubscribed(list) {
      return new Set(list.filter((e) => unsub.includes(e)));
    },
    async tokens(list) {
      return new Map(list.map((e) => [e, `tok-${e}`]));
    },
    async markSent(list) {
      for (const { id } of list) rows.find((r) => r.id === id)!.status = "sent";
    },
    async markFailed(ids) {
      for (const id of ids) rows.find((r) => r.id === id)!.status = "failed";
    },
    async markSkipped(ids) {
      for (const id of ids) rows.find((r) => r.id === id)!.status = "skipped";
    },
    async release(ids) {
      for (const id of ids) rows.find((r) => r.id === id)!.status = "pending";
    },
    async counts() {
      const c: RecipientCounts = {
        pending: 0,
        sending: 0,
        sent: 0,
        failed: 0,
        skipped: 0,
        total: 0,
      };
      for (const r of rows) {
        c[r.status as keyof RecipientCounts] += 1;
        c.total += 1;
      }
      return c;
    },
  };
  return { rows, store };
}

const render = (email: string, token: string): OutgoingMessage => ({
  to: email,
  subject: "S",
  html: token,
  text: token,
  headers: {},
});

test("processBatch sends each recipient exactly once across batches and re-runs", async () => {
  const emails = ["a@x.cz", "b@x.cz", "c@x.cz", "d@x.cz", "e@x.cz"];
  const { store } = memoryStore(emails, ["c@x.cz"]);
  const delivered: string[] = [];
  const send = async (messages: OutgoingMessage[]) => {
    delivered.push(...messages.map((m) => m.to));
    return { ok: true as const, providerIds: messages.map(() => "id") };
  };
  let outcome;
  let i = 0;
  do {
    outcome = await processBatch({
      campaignId: 1,
      batchSize: 2,
      store,
      send,
      render,
      claimToken: `c${i++}`,
    });
  } while (!outcome.done);
  // Extra calls after completion must not send anything.
  await processBatch({ campaignId: 1, batchSize: 2, store, send, render, claimToken: "again" });
  assert.deepEqual(delivered.sort(), ["a@x.cz", "b@x.cz", "d@x.cz", "e@x.cz"]);
  assert.equal(outcome.counts.sent, 4);
  assert.equal(outcome.counts.skipped, 1);
});

test("processBatch releases rows on rate limit and fails them on hard error", async () => {
  const { store, rows } = memoryStore(["a@x.cz", "b@x.cz"]);
  const limited = await processBatch({
    campaignId: 1,
    batchSize: 10,
    store,
    send: async () => ({ ok: false, retryable: true, error: "429" }),
    render,
    claimToken: "x",
  });
  assert.equal(limited.done, false);
  assert.ok(limited.retryAfterMs > 0);
  assert.ok(rows.every((r) => r.status === "pending"));
  const failed = await processBatch({
    campaignId: 1,
    batchSize: 10,
    store,
    send: async () => ({ ok: false, retryable: false, error: "422 invalid" }),
    render,
    claimToken: "y",
  });
  assert.equal(failed.done, true);
  assert.equal(failed.counts.failed, 2);
});

test("stale claims (crash mid-send) are failed, not re-sent", async () => {
  const { store, rows } = memoryStore(["a@x.cz"]);
  await store.claim(1, 10, "crashed", new Date("2026-01-01T00:00:00Z"));
  let calls = 0;
  const outcome = await processBatch({
    campaignId: 1,
    batchSize: 10,
    store,
    send: async (m) => {
      calls += 1;
      return { ok: true, providerIds: m.map(() => null) };
    },
    render,
    claimToken: "next",
    now: new Date("2026-01-01T01:00:00Z"),
  });
  assert.equal(calls, 0);
  assert.equal(rows[0].status, "failed");
  assert.equal(outcome.done, true);
});

test("currentEntrantEmails: contact + authors, skips cancelled and empty applications", () => {
  const out = currentEntrantEmails([
    { email: "Kontakt@x.cz", author: "autor@x.cz", status: 2, lines: [{ author: "radek@x.cz" }] },
    { email: "zruseno@x.cz", author: null, status: 0, lines: [{ author: null }] },
    { email: "prazdna@x.cz", author: null, status: 1, lines: [] },
    { email: "spatny", author: "", status: null, lines: [{ author: "kontakt@x.cz" }] },
  ]);
  assert.deepEqual([...out].sort(), ["autor@x.cz", "kontakt@x.cz", "radek@x.cz"]);
});

test("buildAudience excludes current entrants only when the option is on", () => {
  const sources = {
    userEmails: ["u@x.cz", "letos@x.cz"],
    legacyEmails: ["l@x.cz", "LETOS@x.cz", "o@x.cz", "n@x.cz"],
    unsubscribed: ["o@x.cz"],
    noPromotion: ["n@x.cz"],
    currentEntrants: ["letos@x.cz", "o@x.cz", "n@x.cz"],
  };
  const on = buildAudience(sources, { users: true, years: 10, excludeCurrentEntrants: true });
  assert.deepEqual(on.emails, ["l@x.cz", "u@x.cz"]);
  assert.equal(on.excluded, 3);
  assert.equal(on.noPromotion, 1);
  assert.equal(on.currentEntrants, 1);
  assert.equal(on.users, 1);
  assert.equal(on.legacy, 1);

  const off = buildAudience(sources, { users: true, years: 10, excludeCurrentEntrants: false });
  assert.deepEqual(off.emails, ["l@x.cz", "letos@x.cz", "u@x.cz"]);
  assert.equal(off.currentEntrants, 0);
  assert.equal(off.excluded, 2);
});

const reg = (
  email: string,
  year: number,
  promotion: string | null,
  lineCount?: number,
  id = 1,
) => ({ email, year, promotion, id, created: null, lineCount });

test("an auto-created empty registration does not revoke an earlier opt-out", () => {
  const out = latestPromotionOptOuts([
    reg("a@x.cz", 2025, "N", 3),
    reg("a@x.cz", 2026, null, 0), // prázdná, založená návštěvou stránky
    reg("b@x.cz", 2025, "N", 2),
    reg("b@x.cz", 2026, null, 1), // nová přihláška s běžcem = nový souhlas
    reg("c@x.cz", 2025, null, 2),
    reg("c@x.cz", 2026, "N", 0), // výslovné N platí i u prázdné
  ]);
  assert.deepEqual([...out].sort(), ["a@x.cz", "c@x.cz"]);
});

test("promotionOptOuts: the account decides, registrations only when undecided", () => {
  const registrations = [
    reg("a@x.cz", 2025, "N", 1),
    reg("b@x.cz", 2025, null, 1),
    reg("c@x.cz", 2025, "N", 1),
  ];
  const out = promotionOptOuts(
    [
      { email: "A@x.cz", promotionOptOut: false }, // na účtu znovu povolil
      { email: "b@x.cz", promotionOptOut: true }, // na účtu odmítl
      { email: "c@x.cz", promotionOptOut: null }, // nerozhodnuto → poslední přihláška
      { email: "d@x.cz", promotionOptOut: true }, // bez přihlášky
    ],
    registrations,
  );
  assert.deepEqual([...out].sort(), ["b@x.cz", "c@x.cz", "d@x.cz"]);
});

test("effectivePromotionOptOut for the entry form", () => {
  const registrations = [reg("a@x.cz", 2025, "N", 1)];
  assert.equal(
    effectivePromotionOptOut({ email: "a@x.cz", promotionOptOut: null }, registrations),
    true,
  );
  assert.equal(
    effectivePromotionOptOut({ email: "a@x.cz", promotionOptOut: false }, registrations),
    false,
  );
  assert.equal(effectivePromotionOptOut({ email: "n@x.cz", promotionOptOut: null }, []), false);
});
