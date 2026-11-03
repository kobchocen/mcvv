import { getTranslations } from "next-intl/server";

import { ConfirmSubmitButton } from "@/components/molecules";
import { Button } from "@/components/ui/button";
import type { Locale } from "@/i18n/routing";
import { cancelLateNow, extendLatePayment } from "@/lib/admin/late-actions";
import { lateAdminActionsAllowed } from "@/lib/slots/late-core";

const pragueTime = (d: Date, locale: Locale) =>
  new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "cs-CZ", {
    timeZone: "Europe/Prague",
    weekday: "short",
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);

/**
 * Admin detail přihlášky: stav pozdní přihlášky (lhůta na zaplacení) a zásahy
 * „Prodloužit +60 min“ / „Zrušit hned“ (NAVRH 2.3/8, část 7).
 */
export async function McvvAdminLatePanel({
  year,
  id,
  status,
  submittedAt,
  payUntil,
  autoCancelledAt,
  flash,
  locale,
}: {
  year: number;
  id: number;
  status: number | null;
  submittedAt: Date;
  payUntil: Date | null;
  autoCancelledAt: Date | null;
  flash?: string;
  locale: Locale;
}) {
  const t = await getTranslations({ locale, namespace: "AdminLate" });
  const now = new Date();
  const allowed = lateAdminActionsAllowed({ status, slot: "late", submittedAt, payUntil });
  const minutes = payUntil ? Math.round((payUntil.getTime() - now.getTime()) / 60000) : 0;
  const flashText =
    flash === "extended"
      ? t("flashExtended")
      : flash === "cancelled"
        ? t("flashCancelled")
        : flash === "stale"
          ? t("flashStale")
          : null;
  return (
    <div className="mt-4 max-w-2xl rounded-[12px] border border-race-line/60 p-4 text-sm">
      <p className="font-semibold">
        {t("title")} · {t("submitted", { at: pragueTime(submittedAt, locale) })}
        {payUntil ? <> · {t("payUntil", { at: pragueTime(payUntil, locale) })}</> : null}
      </p>
      {allowed && payUntil ? (
        <>
          <p className="mt-1 text-race-muted">
            {minutes > 0 ? t("left", { minutes }) : t("overdue", { minutes: -minutes })}
          </p>
          <div className="mt-3 flex flex-wrap gap-3">
            <form action={extendLatePayment}>
              <input type="hidden" name="year" value={year} />
              <input type="hidden" name="id" value={id} />
              <Button
                type="submit"
                variant="outline"
                className="h-10 border-race-line bg-race-surface"
              >
                {t("extend")}
              </Button>
            </form>
            <form action={cancelLateNow}>
              <input type="hidden" name="year" value={year} />
              <input type="hidden" name="id" value={id} />
              <ConfirmSubmitButton
                variant="outline"
                destructive
                title={t("cancelTitle", { id })}
                description={minutes > 0 ? t("cancelConfirmBefore") : t("cancelConfirmAfter")}
                confirmLabel={t("cancelNow")}
                cancelLabel={t("keep")}
                className="h-10 border-race-line bg-race-surface"
              >
                {t("cancelNow")}
              </ConfirmSubmitButton>
            </form>
          </div>
          <p className="mt-2 text-xs text-race-muted">{t("hint")}</p>
        </>
      ) : autoCancelledAt ? (
        <p className="mt-1 text-race-muted">
          {t("autoCancelled", { at: pragueTime(autoCancelledAt, locale) })}
        </p>
      ) : null}
      {flashText ? (
        <p
          role={flash === "stale" ? "alert" : "status"}
          className={
            flash === "stale"
              ? "mt-2 text-red-600 dark:text-red-400"
              : "mt-2 font-medium text-race-accent"
          }
        >
          {flashText}
        </p>
      ) : null}
    </div>
  );
}
