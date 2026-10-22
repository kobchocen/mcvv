import { getTranslations } from "next-intl/server";

import type { McvvMessageThreadCopy } from "./mcvv-message-thread";

/** Texty vlákna pro přihlašujícího (namespace Messages). */
export async function userThreadCopy(locale: string): Promise<McvvMessageThreadCopy> {
  const t = await getTranslations({ locale, namespace: "Messages" });
  return {
    mine: t("you"),
    other: t("organizer"),
    unreadLabel: t("unread"),
    unreadHint: t("unreadHint"),
    markRead: t("confirmRead"),
    empty: t("sectionEmpty"),
    resolvedNote: t("resolvedNote"),
    reply: replyCopy(t),
  };
}

/** Texty vlákna pro pořadatele (Admin + Messages). */
export async function staffThreadCopy(locale: string): Promise<McvvMessageThreadCopy> {
  const t = await getTranslations({ locale, namespace: "Messages" });
  const a = await getTranslations({ locale, namespace: "Admin" });
  return {
    mine: t("organizer"),
    other: t("registrant"),
    unreadLabel: a("msgUnread"),
    unreadHint: a("msgUnreadHint"),
    markRead: a("msgMarkRead"),
    empty: t("sectionEmpty"),
    resolve: a("msgResolve"),
    reopen: a("msgReopen"),
    receiptRead: a.raw("msgReceiptRead") as string,
    receiptUnread: a("msgReceiptUnread"),
    receiptHint: a("msgReceiptHint"),
    reply: replyCopy(t),
  };
}

function replyCopy(t: Awaited<ReturnType<typeof getTranslations>>) {
  return {
    label: t("reply"),
    placeholder: t("replyPlaceholder"),
    send: t("send"),
    sending: t("sending"),
    sent: t("sent"),
    chars: t.raw("chars") as string,
    errors: {
      invalid: t("errorInvalid"),
      forbidden: t("errorForbidden"),
      disabled: t("errorDisabled"),
      rate_hour: t("errorRateHour"),
      rate_day: t("errorRateDay"),
      rate_threads: t("errorRateThreads"),
    },
  };
}
