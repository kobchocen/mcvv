import { Check, CheckCheck, MessageSquare } from "lucide-react";

import type { MessageFormState } from "@/lib/messages/actions";
import { readReceipt } from "@/lib/messages/core";
import { formatDateTime, formatShortDateTime } from "@/lib/format/date";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

import { McvvMessageReplyForm, type McvvMessageReplyCopy } from "./mcvv-message-reply-form";

export type McvvThreadMessage = {
  id: number;
  side: "user" | "staff";
  body: string;
  createdAt: Date;
  authorName: string;
  /** Kdy zprávu pořadatele viděl přihlašující (potvrzení o přečtení). */
  readAt?: Date | null;
};

export type McvvMessageThreadCopy = {
  mine: string;
  other: string;
  unreadLabel: string;
  unreadHint: string;
  markRead: string;
  empty: string;
  resolvedNote?: string;
  resolve?: string;
  reopen?: string;
  /** Potvrzení o přečtení u zpráv pořadatele (jen administrace); `{time}` = čas přečtení. */
  receiptRead?: string;
  receiptUnread?: string;
  receiptHint?: string;
  reply: McvvMessageReplyCopy;
};

/**
 * Vlákno zpráv (sdílené webem i administrací). Otevření vlákna nic neoznačuje –
 * přečtení jen tlačítkem „Potvrdit přečtení“ nebo odpovědí. (Potvrzení o přečtení zpráv
 * pořadatele – `readAt` – zapisuje stránka přihlašujícího, ne tato komponenta.)
 */
export function McvvMessageThread({
  viewer,
  messages,
  lastRead,
  status,
  threadId,
  createFields,
  locale,
  copy,
  replyAction,
  markReadAction,
  statusAction,
  canReply = true,
  showAuthorNames = false,
  showReadReceipts = false,
}: {
  viewer: "user" | "staff";
  messages: McvvThreadMessage[];
  lastRead: Date | null;
  status: "open" | "resolved" | null;
  threadId: number | null;
  /** Bez vlákna: skrytá pole pro založení (rok + přihláška). */
  createFields?: Record<string, string | number>;
  locale: string;
  copy: McvvMessageThreadCopy;
  replyAction: (state: MessageFormState, formData: FormData) => Promise<MessageFormState>;
  markReadAction: (formData: FormData) => Promise<void>;
  statusAction?: (formData: FormData) => Promise<void>;
  canReply?: boolean;
  showAuthorNames?: boolean;
  /** U zpráv pořadatele ukázat „Přečteno …“ / „Nepřečteno“ (přečtení přihlašujícím). */
  showReadReceipts?: boolean;
}) {
  const isUnread = (message: McvvThreadMessage) =>
    message.side !== viewer && (!lastRead || message.createdAt.getTime() > lastRead.getTime());
  const unreadCount = messages.filter(isUnread).length;

  return (
    <div className="grid gap-5">
      {messages.length === 0 ? (
        <p className="text-sm text-race-muted">{copy.empty}</p>
      ) : (
        <ol className="grid gap-3">
          {messages.map((message) => {
            const mine = message.side === viewer;
            const unread = isUnread(message);
            return (
              <li
                key={message.id}
                className={cn(
                  "max-w-[42rem] rounded-[12px] border p-4 text-sm leading-6",
                  mine
                    ? "ml-auto border-race-accent/30 bg-race-accent/10"
                    : "mr-auto border-race-line/60 bg-race-surface",
                  unread && "border-race-accent ring-1 ring-race-accent/40",
                )}
              >
                <p className="flex flex-wrap items-center gap-x-2 text-xs text-race-muted">
                  <span className="font-semibold text-foreground dark:text-white">
                    {mine ? copy.mine : copy.other}
                    {showAuthorNames && message.authorName ? ` · ${message.authorName}` : ""}
                  </span>
                  <time dateTime={message.createdAt.toISOString()}>
                    {formatDateTime(message.createdAt, locale)}
                  </time>
                  {unread ? (
                    <span className="rounded-full bg-race-accent-solid px-2 py-0.5 text-[11px] font-semibold uppercase text-white">
                      {copy.unreadLabel}
                    </span>
                  ) : null}
                </p>
                <p className="mt-1.5 whitespace-pre-wrap break-words">{message.body}</p>
                {showReadReceipts ? (
                  <McvvReadReceipt message={message} locale={locale} copy={copy} />
                ) : null}
              </li>
            );
          })}
        </ol>
      )}

      {status === "resolved" && copy.resolvedNote ? (
        <p className="text-sm text-race-muted">{copy.resolvedNote}</p>
      ) : null}

      {threadId !== null && unreadCount > 0 ? (
        <form
          action={markReadAction}
          className="flex flex-wrap items-center gap-3 rounded-[12px] border border-race-accent/40 bg-race-accent/5 p-3"
        >
          <input type="hidden" name="threadId" value={threadId} />
          <p className="text-sm">{copy.unreadHint}</p>
          <Button
            type="submit"
            variant="outline"
            className="h-9 border-race-accent text-race-accent hover:bg-race-accent/10"
          >
            {copy.markRead}
          </Button>
        </form>
      ) : null}

      {canReply ? (
        <McvvMessageReplyForm
          action={replyAction}
          hidden={threadId !== null ? { threadId } : (createFields ?? {})}
          copy={copy.reply}
          idPrefix={`thread-${threadId ?? "new"}`}
        />
      ) : null}

      {statusAction && threadId !== null && status ? (
        <form action={statusAction}>
          <input type="hidden" name="threadId" value={threadId} />
          <input type="hidden" name="status" value={status === "open" ? "resolved" : "open"} />
          <Button type="submit" variant="outline" className="h-9 border-race-line bg-race-surface">
            {status === "open" ? copy.resolve : copy.reopen}
          </Button>
        </form>
      ) : null}
    </div>
  );
}

/** „Přečteno 22. 10. 14:05“ / „Nepřečteno“ pod zprávou pořadatele. */
function McvvReadReceipt({
  message,
  locale,
  copy,
}: {
  message: McvvThreadMessage;
  locale: string;
  copy: McvvMessageThreadCopy;
}) {
  const receipt = readReceipt({ side: message.side, readAt: message.readAt ?? null });
  if (!receipt || !copy.receiptRead || !copy.receiptUnread) return null;
  return (
    <p
      className={cn(
        "mt-2 flex items-center justify-end gap-1 text-xs",
        receipt.read ? "text-race-accent" : "text-race-muted",
      )}
      title={copy.receiptHint}
      data-read-receipt={receipt.read ? "read" : "unread"}
    >
      {receipt.read ? (
        <CheckCheck className="size-3.5" aria-hidden="true" />
      ) : (
        <Check className="size-3.5" aria-hidden="true" />
      )}
      {receipt.read ? (
        <time dateTime={receipt.at.toISOString()}>
          {copy.receiptRead.replace("{time}", formatShortDateTime(receipt.at, locale))}
        </time>
      ) : (
        copy.receiptUnread
      )}
    </p>
  );
}

/** Bublina: počet zpráv, zvýrazněná při nepřečtených. */
export function McvvMessageBubble({
  count,
  unread,
  label,
}: {
  count: number;
  unread: number;
  label: string;
}) {
  return (
    <span
      title={label}
      aria-label={label}
      className={cn(
        "inline-flex h-6 min-w-6 items-center justify-center gap-1 rounded-full px-2 text-xs font-semibold",
        unread > 0
          ? "bg-race-accent-solid text-white"
          : "border border-race-line/70 text-race-muted",
      )}
    >
      <MessageSquare className="size-3" aria-hidden="true" />
      {unread > 0 ? unread : count}
    </span>
  );
}
