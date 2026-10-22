/**
 * Zprávy přihlašující ↔ pořadatel (#108) – čistá logika bez DB (testovatelná).
 *
 * Pravidla čtení: vlákno se označí jako přečtené JEN tlačítkem „Potvrdit přečtení“ nebo
 * odpovědí. Pouhé otevření nic nemění. Pořadatelé sdílí jeden stav přečtení.
 * Výjimka: potvrzení o přečtení pro pořadatele (Message.readAt, viz níže) zakládá už zobrazení.
 */

export type MessageSide = "user" | "staff";
export type ThreadStatus = "open" | "resolved";

export const MESSAGE_MAX_LENGTH = 2000;
export const SUBJECT_MAX_LENGTH = 200;

/** Limity pro přihlašující (pořadatelé limitovaní nejsou). */
export const MESSAGE_LIMITS = {
  perHour: 10,
  perDay: 30,
  newThreadsPerDay: 3,
} as const;

/** Upozornění přihlašujícímu odchází až po klidové době (víc odpovědí = jeden e-mail). */
export const USER_NOTIFY_QUIET_MS = 10 * 60 * 1000;
/** Souhrn pro pořadatele: zprávy mladší než klidová doba počkají na další běh. */
export const DIGEST_QUIET_MS = 10 * 60 * 1000;

export type ThreadReadState = {
  status: ThreadStatus;
  lastUserMessageAt: Date | null;
  lastStaffMessageAt: Date | null;
  lastReadByUser: Date | null;
  lastReadByStaff: Date | null;
};

function after(value: Date | null, read: Date | null): boolean {
  if (!value) return false;
  return !read || value.getTime() > read.getTime();
}

/** Má daná strana ve vlákně nepřečtenou zprávu od protistrany? */
export function hasUnread(thread: ThreadReadState, viewer: MessageSide): boolean {
  return viewer === "user"
    ? after(thread.lastStaffMessageAt, thread.lastReadByUser)
    : after(thread.lastUserMessageAt, thread.lastReadByStaff);
}

/**
 * Odznak v hlavičce: počet vláken s nepřečtenou zprávou od protistrany.
 * Pořadatelům se počítají jen OTEVŘENÁ vlákna (vyřešená nepřidávají práci).
 */
export function countUnreadThreads(threads: ThreadReadState[], viewer: MessageSide): number {
  return threads.filter(
    (thread) => hasUnread(thread, viewer) && (viewer === "user" || thread.status === "open"),
  ).length;
}

/** Počet nepřečtených zpráv protistrany ve vlákně (pro bublinu u přihlášky). */
export function countUnreadMessages(
  messages: { side: MessageSide; createdAt: Date }[],
  lastRead: Date | null,
  viewer: MessageSide,
): number {
  const other: MessageSide = viewer === "user" ? "staff" : "user";
  return messages.filter(
    (message) =>
      message.side === other && (!lastRead || message.createdAt.getTime() > lastRead.getTime()),
  ).length;
}

export type ThreadPatch = Partial<{
  status: ThreadStatus;
  lastMessageAt: Date;
  lastUserMessageAt: Date;
  lastStaffMessageAt: Date;
  lastReadByUser: Date;
  lastReadByStaff: Date;
}>;

/**
 * Změna vlákna po nové zprávě. Odpověď = potvrzení přečtení pro autorovu stranu.
 * Napíše-li přihlašující do vyřešeného vlákna, vlákno se znovu otevře.
 */
export function patchForNewMessage(side: MessageSide, now: Date): ThreadPatch {
  return side === "user"
    ? { lastMessageAt: now, lastUserMessageAt: now, lastReadByUser: now, status: "open" }
    : { lastMessageAt: now, lastStaffMessageAt: now, lastReadByStaff: now };
}

/** Explicitní „Potvrdit přečtení“. */
export function patchForMarkRead(side: MessageSide, now: Date): ThreadPatch {
  return side === "user" ? { lastReadByUser: now } : { lastReadByStaff: now };
}

/** Normalizace textu zprávy; null = neplatný (prázdný / dlouhý / řídicí znaky). */
export function normalizeMessageBody(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  if (raw.length > MESSAGE_MAX_LENGTH * 2) return null;
  const body = raw.replace(/\r\n?/g, "\n").trim();
  if (!body || body.length > MESSAGE_MAX_LENGTH) return null;
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(body)) return null;
  return body;
}

export function normalizeSubject(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const subject = raw
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return subject ? subject.slice(0, SUBJECT_MAX_LENGTH) : null;
}

/** Předmět obecného vlákna z první řádky zprávy. */
export function subjectFromBody(body: string): string {
  const first = body.split("\n")[0]?.trim() ?? "";
  return first.length > 80 ? `${first.slice(0, 79)}…` : first;
}

export type RateUsage = {
  /** Zprávy autora za poslední hodinu. */
  lastHour: number;
  /** Zprávy autora za posledních 24 h. */
  lastDay: number;
  /** Vlákna založená autorem za posledních 24 h. */
  threadsLastDay: number;
};

export type RateVerdict = { ok: true } | { ok: false; reason: "hour" | "day" | "threads" };

/** Limity: 10 zpráv/h, 30 zpráv/den, 3 nová vlákna/den (jen pro přihlašující). */
export function checkRateLimit(usage: RateUsage, newThread: boolean): RateVerdict {
  if (usage.lastHour >= MESSAGE_LIMITS.perHour) return { ok: false, reason: "hour" };
  if (usage.lastDay >= MESSAGE_LIMITS.perDay) return { ok: false, reason: "day" };
  if (newThread && usage.threadsLastDay >= MESSAGE_LIMITS.newThreadsPerDay) {
    return { ok: false, reason: "threads" };
  }
  return { ok: true };
}

export type NotifyState = {
  lastStaffMessageAt: Date | null;
  lastReadByUser: Date | null;
  userNotifiedAt: Date | null;
};

/**
 * Upozornit přihlašujícího? Jen jednou za „cyklus čtení“: po upozornění už další e-mail
 * nepřijde, dokud přihlašující vlákno nepřečte (potvrzením nebo odpovědí).
 */
export function shouldNotifyUser(thread: NotifyState): boolean {
  if (!after(thread.lastStaffMessageAt, thread.lastReadByUser)) return false;
  if (!thread.userNotifiedAt) return true;
  // Upozornění v tomto cyklu už odešlo, pokud je novější než poslední přečtení.
  return (
    !!thread.lastReadByUser && thread.userNotifiedAt.getTime() <= thread.lastReadByUser.getTime()
  );
}

/** Klíč proti dvojímu zařazení upozornění: vlákno + cyklus (čas posledního přečtení). */
export function userNotifyDedupeKey(threadId: number, lastReadByUser: Date | null): string {
  return `msg-user:${threadId}:${lastReadByUser ? lastReadByUser.getTime() : 0}`;
}

export const USER_NOTIFY_KEY_PREFIX = (threadId: number) => `msg-user:${threadId}:`;

export type DigestCandidate = ThreadReadState & {
  id: number;
  staffNotifiedAt: Date | null;
};

/**
 * Vlákna do denního souhrnu pro pořadatele: otevřená, s nepřečtenou zprávou přihlašujícího,
 * která ještě v žádném souhrnu nebyla a je starší než klidová doba.
 */
export function digestThreads<T extends DigestCandidate>(threads: T[], now: Date): T[] {
  return threads.filter(
    (thread) =>
      thread.status === "open" &&
      hasUnread(thread, "staff") &&
      !!thread.lastUserMessageAt &&
      now.getTime() - thread.lastUserMessageAt.getTime() >= DIGEST_QUIET_MS &&
      (!thread.staffNotifiedAt ||
        thread.staffNotifiedAt.getTime() < thread.lastUserMessageAt.getTime()),
  );
}

/** Kalendářní den v Praze (YYYY-MM-DD) – souhrn max. 1× denně. */
export function pragueDay(now: Date, timeZone = "Europe/Prague"): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function digestDedupeKey(now: Date, timeZone?: string): string {
  return `msg-digest:${pragueDay(now, timeZone)}`;
}

export type AdminThreadRow = ThreadReadState & { lastMessageAt: Date };

/** Řazení v /admin/zpravy: otevřené s nepřečtenou zprávou, pak otevřené, pak vyřešené. */
export function sortAdminThreads<T extends AdminThreadRow>(threads: T[]): T[] {
  const rank = (thread: T) => (thread.status === "open" ? (hasUnread(thread, "staff") ? 0 : 1) : 2);
  return [...threads].sort(
    (a, b) => rank(a) - rank(b) || b.lastMessageAt.getTime() - a.lastMessageAt.getTime(),
  );
}

/** E-mail přihlášky odpovídá e-mailu účtu (stejné pravidlo jako u přihlášky). */
export function emailMatches(value: string | null | undefined, email: string): boolean {
  return !!value && value.trim().toLowerCase() === email.trim().toLowerCase();
}

/** Ročník, jehož poznámky převedla migrace 20261020180000_messages na první zprávu vlákna. */
export const NOTES_MIGRATED_YEAR = 2026;

/**
 * Poznámku přihlášky ukázat pořadatelům jako „Interní poznámku“ (jen ke čtení)?
 * Ano u starších ročníků; u převedeného ročníku jen, pokud převod nevznikl (žádné vlákno).
 */
export function showInternalNote(
  note: string | null | undefined,
  year: number,
  hasThread: boolean,
): string | null {
  const text = note?.trim();
  if (!text) return null;
  if (year === NOTES_MIGRATED_YEAR && hasThread) return null;
  return text;
}

export type AdminThreadFilters = {
  status: "open" | "resolved" | "all";
  unreadOnly: boolean;
  type: "all" | "registration" | "general";
  year: number | null;
};

/** Filtry /admin/zpravy z query (?stav=open|resolved&neprectene=1&typ=…&rok=…); výchozí vše. */
export function parseAdminThreadFilters(query: {
  stav?: string;
  neprectene?: string;
  typ?: string;
  rok?: string;
}): AdminThreadFilters {
  const year = Number.parseInt(query.rok ?? "", 10);
  return {
    status: query.stav === "resolved" || query.stav === "open" ? query.stav : "all",
    unreadOnly: query.neprectene === "1",
    type: query.typ === "registration" || query.typ === "general" ? query.typ : "all",
    year: Number.isFinite(year) && year > 1990 && year < 2100 ? year : null,
  };
}

/*
 * Potvrzení o přečtení zpráv pořadatele (read_at na zprávě).
 *
 * Nezávislé na stavu „nepřečteno“ přihlašujícího (lastReadByUser): ten dál mění jen
 * „Potvrdit přečtení“ nebo odpověď (indikátor a upozornění e-mailem se tím řídí beze změny).
 * read_at říká pořadateli, že přihlašující zprávu na webu aspoň viděl: nastaví ho první
 * zobrazení vlákna přihlášeným vlastníkem (ne pořadatelem), potvrzení přečtení i odpověď.
 * E-mailové upozornění přečtení nedokazuje, takže read_at nenastavuje.
 */

export type ReceiptMessage = { id: number; side: MessageSide; readAt: Date | null };

/** Zaznamenat zobrazení vlákna jako přečtení? Jen vlastník s přístupem, který není pořadatel. */
export function shouldRecordUserView(viewer: { isStaff: boolean; canAccess: boolean }): boolean {
  return viewer.canAccess && !viewer.isStaff;
}

/** Zprávy pořadatele, které zobrazení vlákna přihlašujícím označí jako přečtené. */
export function staffMessagesToMarkSeen(messages: ReceiptMessage[]): number[] {
  return messages
    .filter((message) => message.side === "staff" && message.readAt === null)
    .map((message) => message.id);
}

export type ReadReceipt = { read: true; at: Date } | { read: false };

/** Stav přečtení zprávy pro pořadatele; u zpráv přihlašujícího null (neeviduje se). */
export function readReceipt(message: {
  side: MessageSide;
  readAt: Date | null;
}): ReadReceipt | null {
  if (message.side !== "staff") return null;
  return message.readAt ? { read: true, at: message.readAt } : { read: false };
}

export type StaffReplyReceipt = { read: true; at: Date } | { read: false; unreadCount: number };

/**
 * Přehled /admin/zpravy: stav přečtení odpovědí pořadatele ve vlákně.
 * Přečteno = přihlašující viděl i poslední odpověď (čas přečtení poslední odpovědi).
 * Nepřečteno = počet odpovědí pořadatele, které přihlašující ještě neviděl. Bez odpovědí null.
 */
export function staffReplyReceipt(
  staffMessages: { createdAt: Date; readAt: Date | null }[],
): StaffReplyReceipt | null {
  if (staffMessages.length === 0) return null;
  const latest = staffMessages.reduce((a, b) =>
    b.createdAt.getTime() > a.createdAt.getTime() ? b : a,
  );
  if (latest.readAt) return { read: true, at: latest.readAt };
  return { read: false, unreadCount: staffMessages.filter((message) => !message.readAt).length };
}
