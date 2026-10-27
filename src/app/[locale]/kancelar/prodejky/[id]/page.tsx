import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import {
  McvvCashDeskForbidden,
  McvvCashDeskNav,
  saleStatusClass,
} from "@/components/organisms/mcvv-cash-desk-nav";
import { McvvPollRefresh } from "@/components/organisms/mcvv-poll-refresh";
import { Link, type Locale } from "@/i18n/routing";
import { canMarkSalePaidBank } from "@/lib/auth/roles";
import { BANK_ACCOUNT, BANK_IBAN, spdPaymentQrSvg } from "@/lib/entries/spd";
import { cancelSale, markSalePaidBank, markSalePaidCash } from "@/lib/sales/actions";
import { saleQrMessage } from "@/lib/sales/core";
import { cashDeskPageSession } from "@/lib/sales/guard";
import { getSale } from "@/lib/sales/sales";

type PageProps = Readonly<{
  params: Promise<{ locale: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "CashDesk" });
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

const czk = (value: number) => `${value.toLocaleString("cs-CZ")} Kč`;
const when = (d: Date | null) =>
  d ? d.toLocaleString("cs-CZ", { timeZone: "Europe/Prague" }) : "–";
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

const FLASH_OK = new Set(["paid_cash", "paid_bank", "cancelled"]);
const FLASH_ERR = new Set(["forbidden", "not_found", "not_unpaid"]);

/** Detail prodejky (#207): QR platba, stav, „Zaplaceno hotově“, storno. */
export default async function SaleDetailPage({ params, searchParams }: PageProps) {
  const { locale, id } = await params;
  setRequestLocale(locale as Locale);
  const session = await cashDeskPageSession("/kancelar/prodejky");
  if (!session) return <McvvCashDeskForbidden />;
  const t = await getTranslations({ locale: locale as Locale, namespace: "CashDesk" });
  const saleId = /^\d{1,9}$/.test(id) ? Number(id) : 0;
  const sale = saleId ? await getSale(saleId) : null;
  if (!sale) notFound();
  const query = await searchParams;
  const ok = one(query.ok);
  const err = one(query.chyba);
  const unpaid = sale.status === "unpaid";
  const qr = unpaid
    ? await spdPaymentQrSvg({ amount: sale.total, vs: sale.vs, message: saleQrMessage(sale.vs) })
    : null;
  const btn = "h-14 w-full font-display text-lg font-bold";

  return (
    <main className="min-h-screen bg-race-deep text-foreground">
      {unpaid ? <McvvPollRefresh intervalMs={15_000} /> : null}
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-3 pb-10 pt-4">
        <McvvCashDeskNav session={session} active="sales" />
        {FLASH_OK.has(ok) ? (
          <p
            role="status"
            className="border border-emerald-500/60 bg-emerald-500/10 p-3 text-sm font-semibold"
          >
            {t(`flash_${ok}`)}
          </p>
        ) : null}
        {FLASH_ERR.has(err) ? (
          <p
            role="alert"
            className="border border-red-500/60 p-3 text-sm text-red-600 dark:text-red-400"
          >
            {t(`flashError_${err}`)}
          </p>
        ) : null}

        <section className="grid gap-4 border border-race-line/60 bg-race-surface p-4 sm:grid-cols-[1fr_auto]">
          <div className="grid content-start gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-xl font-semibold">
                {t("saleTitle", { number: sale.number })}
              </h2>
              <span
                className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${saleStatusClass(sale.status)}`}
                data-testid="sale-status"
              >
                {t(`status_${sale.status}`)}
              </span>
            </div>
            <p
              className="font-display text-5xl font-bold tabular-nums text-foreground dark:text-white"
              data-testid="sale-total"
            >
              {czk(sale.total)}
            </p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-race-muted">{t("vs")}</dt>
              <dd className="font-mono text-lg font-semibold" data-testid="sale-vs">
                {sale.vs}
              </dd>
              <dt className="text-race-muted">{t("account")}</dt>
              <dd>
                {BANK_ACCOUNT} (Fio) · IBAN {BANK_IBAN}
              </dd>
              <dt className="text-race-muted">{t("message")}</dt>
              <dd>{saleQrMessage(sale.vs)}</dd>
              <dt className="text-race-muted">{t("createdBy")}</dt>
              <dd>
                {sale.createdByName}, {when(sale.createdAt)}
              </dd>
              {sale.paidAt ? (
                <>
                  <dt className="text-race-muted">{t("paidBy")}</dt>
                  <dd data-testid="sale-paid">
                    {sale.paidByName === "fio" ? t("paidByFio") : sale.paidByName},{" "}
                    {when(sale.paidAt)}
                  </dd>
                </>
              ) : null}
              {sale.cancelledAt ? (
                <>
                  <dt className="text-race-muted">{t("cancelledBy")}</dt>
                  <dd>
                    {sale.cancelledBy}, {when(sale.cancelledAt)}
                  </dd>
                </>
              ) : null}
            </dl>
          </div>
          {qr ? (
            <div className="justify-self-center">
              <div
                className="aspect-square w-64 bg-white p-2 [&_svg]:h-full [&_svg]:w-full"
                data-testid="sale-qr"
                dangerouslySetInnerHTML={{ __html: qr }}
              />
              <p className="mt-2 max-w-64 text-center text-xs text-race-muted">{t("qrHint")}</p>
            </div>
          ) : null}
        </section>

        <section className="border border-race-line/60 bg-race-surface">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-race-line text-xs font-semibold uppercase tracking-wide text-race-dim">
                <th className="px-3 py-2">{t("colItem")}</th>
                <th className="px-3 py-2 text-right">{t("colQty")}</th>
                <th className="px-3 py-2 text-right">{t("colPrice")}</th>
                <th className="px-3 py-2 text-right">{t("colLineTotal")}</th>
              </tr>
            </thead>
            <tbody>
              {sale.lines.map((line) => (
                <tr key={line.id} className="border-b border-race-line/40">
                  <td className="px-3 py-2">{line.name}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{line.quantity}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{czk(line.unitPrice)}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">
                    {czk(line.lineTotal)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {unpaid ? (
          <section className="grid gap-3" aria-label={t("actions")}>
            <form action={markSalePaidCash}>
              <input type="hidden" name="id" value={sale.id} />
              <button
                type="submit"
                className={`${btn} bg-emerald-700 text-white hover:bg-emerald-800`}
                data-testid="mark-cash"
              >
                {t("markCash")}
              </button>
            </form>
            {canMarkSalePaidBank(session.role) ? (
              <form action={markSalePaidBank} className="grid gap-2 border border-race-line/60 p-3">
                <input type="hidden" name="id" value={sale.id} />
                <label className="text-xs text-race-muted" htmlFor="note">
                  {t("markBankHint")}
                </label>
                <input
                  id="note"
                  name="note"
                  maxLength={200}
                  className="h-11 border border-race-line/60 bg-race-deep px-2 text-sm"
                  placeholder={t("markBankNote")}
                />
                <button
                  type="submit"
                  className="h-11 border border-race-line bg-race-surface text-sm font-semibold"
                >
                  {t("markBank")}
                </button>
              </form>
            ) : null}
            <form
              action={cancelSale}
              className="flex flex-wrap items-center gap-3 border border-red-500/40 p-3"
            >
              <input type="hidden" name="id" value={sale.id} />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="confirm" value="1" required className="h-5 w-5" />
                {t("cancelConfirm")}
              </label>
              <button
                type="submit"
                className="h-11 border border-red-500/60 px-4 text-sm font-semibold text-red-600 dark:text-red-400"
              >
                {t("cancel")}
              </button>
            </form>
          </section>
        ) : null}

        <Link
          href="/kancelar"
          className={`${btn} flex items-center justify-center bg-race-accent-solid text-white hover:bg-race-accent-solid-hover`}
          data-testid="new-sale"
        >
          {t("newSale")}
        </Link>
      </div>
    </main>
  );
}

export const dynamic = "force-dynamic";
