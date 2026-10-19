/**
 * Newsletter core: pure, framework-free logic (audience, rendering, batch sending).
 * Database and mail access are injected so the logic is unit-testable.
 */

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i;

export function normalizeEmail(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const email = value.trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email) || email.includes("..")) {
    return null;
  }
  return email;
}

export type AudienceOptions = {
  users: boolean;
  years: number;
  /** Vyřadit adresy, které už jsou přihlášené na aktuální ročník. */
  excludeCurrentEntrants?: boolean;
};

export type AudienceSources = {
  userEmails: (string | null)[];
  legacyEmails: (string | null)[];
  unsubscribed: Iterable<string>;
  /** Emails whose latest application said promotion = 'N' (see latestPromotionOptOuts). */
  noPromotion?: Iterable<string>;
  /** Emails already registered for the current edition (see currentEntrantEmails). */
  currentEntrants?: Iterable<string>;
};

export type CurrentEntryRecord = {
  email: string | null;
  author: string | null;
  status: number | null;
  lines: { author: string | null }[];
};

/** Legacy `mcvv_prihlaska.stav` 0 = zrušená (see ENTRY_STATUS.cancelled). */
const CANCELLED_STATUS = 0;

/**
 * Emails of people already registered for the current edition: the application
 * contact email plus whoever created the application or its runner lines (logged-in
 * user email). Cancelled applications and applications without any runner are ignored.
 */
export function currentEntrantEmails(records: Iterable<CurrentEntryRecord>): Set<string> {
  const out = new Set<string>();
  for (const r of records) {
    if (r.status === CANCELLED_STATUS || r.lines.length === 0) continue;
    for (const raw of [r.email, r.author, ...r.lines.map((l) => l.author)]) {
      const email = normalizeEmail(raw);
      if (email) out.add(email);
    }
  }
  return out;
}

export type PromotionRecord = {
  email: string | null;
  promotion: string | null;
  year: number;
  created: Date | null;
  id: number;
};

/**
 * Emails that refused promotion: for each email the latest application
 * (by year, then created, then id) decides; 'N' means excluded.
 * A later application without 'N' re-enables the email.
 */
export function latestPromotionOptOuts(records: Iterable<PromotionRecord>): Set<string> {
  const latest = new Map<string, PromotionRecord>();
  const key = (r: PromotionRecord) => [r.year, r.created?.getTime() ?? 0, r.id];
  for (const r of records) {
    const email = normalizeEmail(r.email);
    if (!email) continue;
    const prev = latest.get(email);
    if (!prev) {
      latest.set(email, r);
      continue;
    }
    const [a, b] = [key(r), key(prev)];
    const newer = a[0] !== b[0] ? a[0] > b[0] : a[1] !== b[1] ? a[1] > b[1] : a[2] > b[2];
    if (newer) latest.set(email, r);
  }
  const out = new Set<string>();
  for (const [email, r] of latest) {
    if ((r.promotion ?? "").trim().toUpperCase() === "N") out.add(email);
  }
  return out;
}

export type Audience = {
  emails: string[];
  users: number;
  legacy: number;
  excluded: number;
  /** Of `excluded`, how many because of promotion = 'N'. */
  noPromotion: number;
  /** Of `excluded`, how many because they are already registered for the current edition. */
  currentEntrants: number;
};

/** Deduplicated, validated, opt-outs excluded. Counts are per source after dedupe. */
export function buildAudience(sources: AudienceSources, options: AudienceOptions): Audience {
  const unsubscribed = new Set<string>();
  const blockedPromo = new Set<string>();
  for (const email of sources.unsubscribed) {
    const normalized = normalizeEmail(email);
    if (normalized) {
      unsubscribed.add(normalized);
    }
  }
  for (const email of sources.noPromotion ?? []) {
    const normalized = normalizeEmail(email);
    if (normalized) {
      blockedPromo.add(normalized);
    }
  }
  const entrants = new Set<string>();
  if (options.excludeCurrentEntrants) {
    for (const email of sources.currentEntrants ?? []) {
      const normalized = normalizeEmail(email);
      if (normalized) {
        entrants.add(normalized);
      }
    }
  }
  const blocked = (e: string) => unsubscribed.has(e) || blockedPromo.has(e) || entrants.has(e);
  const users = new Set<string>();
  const legacy = new Set<string>();
  if (options.users) {
    for (const raw of sources.userEmails) {
      const email = normalizeEmail(raw);
      if (email) users.add(email);
    }
  }
  if (options.years > 0) {
    for (const raw of sources.legacyEmails) {
      const email = normalizeEmail(raw);
      if (email) legacy.add(email);
    }
  }
  const all = new Set([...users, ...legacy]);
  let excluded = 0;
  let noPromotion = 0;
  let currentEntrants = 0;
  const emails: string[] = [];
  for (const email of all) {
    if (blocked(email)) {
      excluded += 1;
      // Each excluded address is attributed to one reason: unsubscribe > promotion > entrant.
      if (unsubscribed.has(email)) continue;
      if (blockedPromo.has(email)) noPromotion += 1;
      else currentEntrants += 1;
    } else {
      emails.push(email);
    }
  }
  emails.sort();
  return {
    emails,
    users: [...users].filter((e) => !blocked(e)).length,
    legacy: [...legacy].filter((e) => !blocked(e)).length,
    excluded,
    noPromotion,
    currentEntrants,
  };
}

/** First year included when selecting the last `years` years (current year counts). */
export function legacyFromYear(years: number, now = new Date()): number {
  return now.getFullYear() - Math.max(1, years) + 1;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const LINK_RE = /\[([^\]]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)/g;

function inlineHtml(text: string): string {
  let html = escapeHtml(text);
  html = html.replace(
    LINK_RE,
    (_m, label: string, url: string) =>
      `<a href="${url}" style="color:#e2531c;text-decoration:underline">${label}</a>`,
  );
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
  return html;
}

/** Minimal, safe Markdown subset: headings, paragraphs, lists, bold, italic, links. */
export function renderMarkdown(markdown: string): string {
  const blocks = markdown
    .replace(/\r\n?/g, "\n")
    .trim()
    .split(/\n{2,}/);
  const out: string[] = [];
  for (const block of blocks) {
    const lines = block.split("\n");
    const heading = /^(#{1,3})\s+(.*)$/.exec(lines[0] ?? "");
    if (heading && lines.length === 1) {
      const level = heading[1].length + 1;
      out.push(
        `<h${level} style="margin:24px 0 8px;font-size:${24 - level * 2}px;color:#0f2a1c">${inlineHtml(heading[2])}</h${level}>`,
      );
    } else if (lines.every((line) => /^[-*]\s+/.test(line))) {
      out.push(
        `<ul style="margin:0 0 16px;padding-left:20px">${lines.map((l) => `<li>${inlineHtml(l.replace(/^[-*]\s+/, ""))}</li>`).join("")}</ul>`,
      );
    } else if (lines.every((line) => /^\d+[.)]\s+/.test(line))) {
      out.push(
        `<ol style="margin:0 0 16px;padding-left:20px">${lines.map((l) => `<li>${inlineHtml(l.replace(/^\d+[.)]\s+/, ""))}</li>`).join("")}</ol>`,
      );
    } else if (block.trim()) {
      out.push(`<p style="margin:0 0 16px">${lines.map(inlineHtml).join("<br>")}</p>`);
    }
  }
  return out.join("\n");
}

export function markdownToText(markdown: string): string {
  return markdown
    .replace(/\r\n?/g, "\n")
    .replace(LINK_RE, (_m, label: string, url: string) => `${label} (${url})`)
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/^#{1,3}\s+/gm, "")
    .trim();
}

export type RenderedEmail = { subject: string; html: string; text: string };

export function renderNewsletter(input: {
  subject: string;
  body: string;
  unsubscribeUrl: string;
  siteUrl: string;
}): RenderedEmail {
  const unsub = escapeHtml(input.unsubscribeUrl);
  const site = escapeHtml(input.siteUrl);
  const html = `<!doctype html>
<html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(input.subject)}</title></head>
<body style="margin:0;padding:0;background:#f2f6f1;font-family:Arial,Helvetica,sans-serif;color:#1d2a22">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f6f1"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff">
<tr><td style="background:#0f2a1c;padding:20px 28px;border-bottom:4px solid #e2531c">
<a href="${site}" style="color:#ffffff;text-decoration:none;font-size:20px;font-weight:bold;letter-spacing:.5px">MCVV</a>
<span style="color:#b9cbbf;font-size:13px;padding-left:8px">Malá cena Velké Verandy</span>
</td></tr>
<tr><td style="padding:28px;font-size:16px;line-height:1.55">
${renderMarkdown(input.body)}
</td></tr>
<tr><td style="padding:18px 28px;background:#f7f9f6;color:#5d6d63;font-size:12px;line-height:1.5">
Tento e-mail dostáváte, protože jste se registrovali na <a href="${site}" style="color:#5d6d63">mcvv.org</a> nebo jste se v minulosti přihlásili na závod MCVV.<br>
Nechcete už od nás novinky? <a href="${unsub}" style="color:#e2531c">Odhlásit odběr jedním kliknutím</a>.
</td></tr>
</table></td></tr></table></body></html>`;
  const text = `${markdownToText(input.body)}

--
MCVV – Malá cena Velké Verandy, ${input.siteUrl}
Tento e-mail dostáváte, protože jste se registrovali na mcvv.org nebo jste se v minulosti přihlásili na závod MCVV.
Odhlášení z odběru: ${input.unsubscribeUrl}
`;
  return { subject: input.subject, html, text };
}

export function unsubscribeUrl(origin: string, token: string, locale = "cs"): string {
  return `${origin.replace(/\/$/, "")}/${locale}/newsletter/odhlasit?token=${token}`;
}

export function unsubscribeHeaders(origin: string, token: string): Record<string, string> {
  const post = `${origin.replace(/\/$/, "")}/api/newsletter/unsubscribe?token=${token}`;
  return {
    "List-Unsubscribe": `<${post}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
}

// ---------------------------------------------------------------------------
// Batch sending (resumable, idempotent)
// ---------------------------------------------------------------------------

export type RecipientRow = { id: number; email: string };

export type RecipientCounts = {
  pending: number;
  sending: number;
  sent: number;
  failed: number;
  skipped: number;
  total: number;
};

export type OutgoingMessage = RenderedEmail & { to: string; headers: Record<string, string> };

export type BatchSendResult =
  | { ok: true; providerIds: (string | null)[] }
  | { ok: false; retryable: boolean; error: string };

export interface NewsletterStore {
  /** Atomically move up to `limit` pending rows to `sending` under `claimToken`. */
  claim(campaignId: number, limit: number, claimToken: string, now: Date): Promise<RecipientRow[]>;
  /** Rows stuck in `sending` (crash mid-batch) become `failed`, never silently re-sent. */
  failStale(campaignId: number, olderThan: Date): Promise<number>;
  unsubscribed(emails: string[]): Promise<Set<string>>;
  tokens(emails: string[]): Promise<Map<string, string>>;
  markSent(rows: { id: number; providerId: string | null }[], now: Date): Promise<void>;
  markFailed(ids: number[], error: string): Promise<void>;
  markSkipped(ids: number[]): Promise<void>;
  release(ids: number[]): Promise<void>;
  counts(campaignId: number): Promise<RecipientCounts>;
}

export type BatchOutcome = {
  counts: RecipientCounts;
  done: boolean;
  sent: number;
  retryAfterMs: number;
  error?: string;
  /** Denní rozpočet e-mailů vyčerpán – pokračuje se automaticky (cron) další den. */
  paused?: "cap" | "quota";
};

export const STALE_CLAIM_MS = 15 * 60 * 1000;

export async function processBatch(input: {
  campaignId: number;
  batchSize: number;
  store: NewsletterStore;
  send: (messages: OutgoingMessage[], idempotencyKey: string) => Promise<BatchSendResult>;
  render: (email: string, token: string) => OutgoingMessage;
  claimToken: string;
  now?: Date;
}): Promise<BatchOutcome> {
  const now = input.now ?? new Date();
  const { store } = input;
  await store.failStale(input.campaignId, new Date(now.getTime() - STALE_CLAIM_MS));
  const claimed = await store.claim(input.campaignId, input.batchSize, input.claimToken, now);
  let sent = 0;
  let retryAfterMs = 0;
  let error: string | undefined;
  if (claimed.length > 0) {
    const blocked = await store.unsubscribed(claimed.map((r) => r.email));
    const skip = claimed.filter((r) => blocked.has(r.email));
    const go = claimed.filter((r) => !blocked.has(r.email));
    if (skip.length) await store.markSkipped(skip.map((r) => r.id));
    if (go.length) {
      const tokens = await store.tokens(go.map((r) => r.email));
      const missing = go.filter((r) => !tokens.has(r.email));
      if (missing.length)
        await store.markFailed(
          missing.map((r) => r.id),
          "chybí token odhlášení",
        );
      const ready = go.filter((r) => tokens.has(r.email));
      if (ready.length) {
        const messages = ready.map((r) => input.render(r.email, tokens.get(r.email)!));
        const result = await input.send(
          messages,
          `mcvv-nl-${input.campaignId}-${input.claimToken}`,
        );
        if (result.ok) {
          await store.markSent(
            ready.map((r, i) => ({ id: r.id, providerId: result.providerIds[i] ?? null })),
            now,
          );
          sent = ready.length;
        } else if (result.retryable) {
          await store.release(ready.map((r) => r.id));
          retryAfterMs = 2000;
          error = result.error;
        } else {
          await store.markFailed(
            ready.map((r) => r.id),
            result.error.slice(0, 500),
          );
          error = result.error;
        }
      }
    }
  }
  const counts = await store.counts(input.campaignId);
  return {
    counts,
    done: counts.pending === 0 && counts.sending === 0,
    sent,
    retryAfterMs,
    error,
  };
}
