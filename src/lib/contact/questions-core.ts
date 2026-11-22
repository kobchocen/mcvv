/**
 * Dotazy z kontaktního formuláře (#205) – čistá logika bez DB: stavy, filtr seznamu,
 * validace odpovědi a e-mail s odpovědí v jazyce dotazu (cs / en / de / pl / uk).
 */
import { escapeHtml, renderBrandedEmail } from "@/lib/mail/layout";

export const QUESTION_STATUSES = ["new", "answered", "closed"] as const;
export type QuestionStatus = (typeof QUESTION_STATUSES)[number];

export const QUESTION_LOCALES = ["cs", "en", "de", "pl", "uk"] as const;
export type QuestionLocale = (typeof QUESTION_LOCALES)[number];

/** Nejdelší odpověď pořadatele (znaků). */
export const REPLY_MAX = 8000;
/** Kolik dotazů ukáže seznam najednou. */
export const QUESTION_PAGE_SIZE = 100;

export function isQuestionStatus(value: unknown): value is QuestionStatus {
  return typeof value === "string" && (QUESTION_STATUSES as readonly string[]).includes(value);
}

export function questionLocale(value: unknown): QuestionLocale {
  return typeof value === "string" && (QUESTION_LOCALES as readonly string[]).includes(value)
    ? (value as QuestionLocale)
    : "cs";
}

export type QuestionFilter = { status: QuestionStatus | "open" | "all"; q: string };

/** Filtr seznamu z URL: výchozí „otevřené“ (nové + zodpovězené), hledání v jménu / e-mailu. */
export function parseQuestionFilter(raw: { stav?: string; q?: string }): QuestionFilter {
  const stav = raw.stav;
  const status = stav === "all" || stav === "open" || isQuestionStatus(stav) ? stav : "open";
  const q = typeof raw.q === "string" ? raw.q.trim().slice(0, 100) : "";
  return { status, q };
}

/** Stavy, které filtr pouští. */
export function statusesFor(filter: QuestionFilter["status"]): QuestionStatus[] {
  if (filter === "all") return [...QUESTION_STATUSES];
  if (filter === "open") return ["new", "answered"];
  return [filter];
}

/** Odpověď: ořezaná, sjednocené konce řádků, bez řídicích znaků, 1–REPLY_MAX znaků. */
export function normalizeReply(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length > REPLY_MAX * 2) return null;
  const body = raw.replace(/\r\n?/g, "\n").trim();
  if (!body || body.length > REPLY_MAX) return null;
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body)) return null;
  return body;
}

/** Po odeslané odpovědi je dotaz zodpovězený (i uzavřený se odpovědí znovu otevře jako zodpovězený). */
export function statusAfterReply(): QuestionStatus {
  return "answered";
}

type ReplyLabels = {
  subject: string;
  intro: (name: string) => string;
  yourQuestion: string;
  replyHint: string;
  footer: string;
};

const REPLY_LABELS: Record<QuestionLocale, ReplyLabels> = {
  cs: {
    subject: "Odpověď na váš dotaz – MCVV",
    intro: (n) => `Dobrý den, ${n},`,
    yourQuestion: "Váš dotaz",
    replyHint: "Na tento e-mail můžete přímo odpovědět.",
    footer: "Tento e-mail jste dostali, protože jste poslali dotaz přes kontaktní formulář na",
  },
  en: {
    subject: "Reply to your question – MCVV",
    intro: (n) => `Hello ${n},`,
    yourQuestion: "Your question",
    replyHint: "You can reply to this e-mail directly.",
    footer: "You received this e-mail because you sent a question via the contact form on",
  },
  de: {
    subject: "Antwort auf Ihre Anfrage – MCVV",
    intro: (n) => `Guten Tag ${n},`,
    yourQuestion: "Ihre Anfrage",
    replyHint: "Sie können direkt auf diese E-Mail antworten.",
    footer:
      "Sie erhalten diese E-Mail, weil Sie über das Kontaktformular eine Anfrage gesendet haben –",
  },
  pl: {
    subject: "Odpowiedź na Twoje pytanie – MCVV",
    intro: (n) => `Dzień dobry, ${n},`,
    yourQuestion: "Twoje pytanie",
    replyHint: "Możesz odpowiedzieć bezpośrednio na tę wiadomość.",
    footer: "Otrzymujesz tę wiadomość, ponieważ wysłałeś pytanie przez formularz kontaktowy –",
  },
  uk: {
    subject: "Відповідь на ваше запитання – MCVV",
    intro: (n) => `Добрий день, ${n},`,
    yourQuestion: "Ваше запитання",
    replyHint: "Ви можете відповісти безпосередньо на цей лист.",
    footer: "Ви отримали цей лист, бо надіслали запитання через контактну форму –",
  },
};

const quoteText = (text: string) =>
  text
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");

const paragraphs = (text: string) =>
  text
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px;white-space:pre-wrap">${escapeHtml(p)}</p>`)
    .join("");

/** E-mail s odpovědí: oslovení, text pořadatele, citace dotazu; odpovídat jde přes Reply-To. */
export function renderQuestionReply(input: {
  question: { name: string; message: string; locale: string };
  body: string;
  site: string;
}): { subject: string; html: string; text: string } {
  const l = REPLY_LABELS[questionLocale(input.question.locale)];
  const { question, body } = input;
  const htmlBlocks = [
    `<p style="margin:0 0 12px">${escapeHtml(l.intro(question.name))}</p>`,
    paragraphs(body),
    `<p style="margin:16px 0 4px;color:#5d6d63;font-size:13px">${escapeHtml(l.yourQuestion)}:</p>`,
    `<blockquote style="margin:0 0 16px;padding:8px 12px;border-left:3px solid #e3e9e4;color:#5d6d63;white-space:pre-wrap">${escapeHtml(question.message)}</blockquote>`,
    `<p style="margin:0;color:#5d6d63;font-size:13px">${escapeHtml(l.replyHint)}</p>`,
  ];
  const text = [
    l.intro(question.name),
    "",
    body,
    "",
    `${l.yourQuestion}:`,
    quoteText(question.message),
    "",
    l.replyHint,
  ].join("\n");
  return {
    subject: l.subject,
    ...renderBrandedEmail({
      subject: l.subject,
      site: input.site,
      htmlBlocks,
      text,
      footer: l.footer,
    }),
  };
}

/** Odkaz na detail dotazu v administraci (do upozornění pořadateli). */
export function questionAdminUrl(site: string, id: number): string {
  return `${site.replace(/\/+$/, "")}/cs/admin/zpravy/dotazy/${id}`;
}
