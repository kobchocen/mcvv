import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import {
  McvvCashDeskForbidden,
  McvvCashDeskNav,
  saleStatusClass,
} from "@/components/organisms/mcvv-cash-desk-nav";
import { Link, type Locale } from "@/i18n/routing";
import { currentRaceYear } from "@/lib/entries/year";
import { dailySummary, parseSaleFilter, pragueDay, SALE_STATUSES } from "@/lib/sales/core";
import { cashDeskPageSession } from "@/lib/sales/guard";
import { listSales } from "@/lib/sales/sales";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "CashDesk" });
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

const czk = (value: number) => `${value.toLocaleString("cs-CZ")} Kč`;
const when = (d: Date) =>
  d.toLocaleString("cs-CZ", {
    timeZone: "Europe/Prague",
    day: "numeric",
    month: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
const dayLabel = (day: string) => {
  const [y, m, d] = day.split("-");
  return `${Number(d)}. ${Number(m)}. ${y}`;
};

/** Přehled prodejek (#207): filtry stav / den / prodávající a denní součty. */
export default async function SalesListPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const session = await cashDeskPageSession("/kancelar/prodejky");
  if (!session) return <McvvCashDeskForbidden />;
  const t = await getTranslations({ locale: locale as Locale, namespace: "CashDesk" });
  const { year } = await currentRaceYear();
  const filter = parseSaleFilter(await searchParams);
  const { rows, all, creators, matching } = await listSales(year, filter);
  const days = dailySummary(all);
  const dayOptions = days.map((d) => d.day);
  const totals = days.reduce(
    (sum, d) => ({
      paidCash: sum.paidCash + d.paidCash,
      paidBank: sum.paidBank + d.paidBank,
      unpaid: sum.unpaid + d.unpaid,
      count: sum.count + d.count,
    }),
    { paidCash: 0, paidBank: 0, unpaid: 0, count: 0 },
  );
  const field = "h-11 border border-race-line/60 bg-race-surface px-2 text-sm";
  const th = "px-3 py-2";
  const td = "px-3 py-2 align-top";

  return (
    <main className="min-h-screen bg-race-deep text-foreground">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-3 pb-10 pt-4">
        <McvvCashDeskNav session={session} active="sales" />

        <section aria-label={t("daily")} className="grid gap-2" data-testid="daily-totals">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-race-muted">
            {t("daily")} · {year}
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-race-line text-xs font-semibold uppercase tracking-wide text-race-dim">
                  <th className={th}>{t("colDay")}</th>
                  <th className={`${th} text-right`}>{t("colCount")}</th>
                  <th className={`${th} text-right`}>{t("status_paid_cash")}</th>
                  <th className={`${th} text-right`}>{t("status_paid_bank")}</th>
                  <th className={`${th} text-right`}>{t("status_unpaid")}</th>
                  <th className={`${th} text-right`}>{t("status_cancelled")}</th>
                </tr>
              </thead>
              <tbody>
                {days.map((d) => (
                  <tr key={d.day} className="border-b border-race-line/40">
                    <td className={td}>{dayLabel(d.day)}</td>
                    <td className={`${td} text-right tabular-nums`}>{d.count}</td>
                    <td className={`${td} text-right tabular-nums`}>{czk(d.paidCash)}</td>
                    <td className={`${td} text-right tabular-nums`}>{czk(d.paidBank)}</td>
                    <td className={`${td} text-right tabular-nums`}>{czk(d.unpaid)}</td>
                    <td className={`${td} text-right tabular-nums`}>{d.cancelled}</td>
                  </tr>
                ))}
                {days.length > 1 ? (
                  <tr className="font-semibold">
                    <td className={td}>{t("totalYear")}</td>
                    <td className={`${td} text-right tabular-nums`}>{totals.count}</td>
                    <td className={`${td} text-right tabular-nums`}>{czk(totals.paidCash)}</td>
                    <td className={`${td} text-right tabular-nums`}>{czk(totals.paidBank)}</td>
                    <td className={`${td} text-right tabular-nums`}>{czk(totals.unpaid)}</td>
                    <td className={td}></td>
                  </tr>
                ) : null}
                {days.length === 0 ? (
                  <tr>
                    <td className={`${td} text-race-muted`} colSpan={6}>
                      {t("empty")}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <form method="get" className="flex flex-wrap items-end gap-2" data-testid="sale-filter">
          <label className="grid gap-1 text-xs text-race-muted">
            {t("filterStatus")}
            <select name="stav" defaultValue={filter.status ?? ""} className={field}>
              <option value="">{t("all")}</option>
              <option value="paid">{t("filterPaid")}</option>
              {SALE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`status_${s}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs text-race-muted">
            {t("filterDay")}
            <select name="den" defaultValue={filter.day ?? ""} className={field}>
              <option value="">{t("all")}</option>
              {dayOptions.map((d) => (
                <option key={d} value={d}>
                  {dayLabel(d)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-xs text-race-muted">
            {t("filterCreator")}
            <select name="kdo" defaultValue={filter.creator} className={field}>
              <option value="">{t("all")}</option>
              {creators.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <button
            type="submit"
            className="h-11 bg-race-accent-solid px-4 text-sm font-semibold text-white"
          >
            {t("filter")}
          </button>
          <Link
            href="/kancelar/prodejky"
            className="h-11 px-2 text-sm leading-[2.75rem] text-race-accent"
          >
            {t("reset")}
          </Link>
        </form>

        <p className="text-xs text-race-muted">
          {t("shown", { shown: rows.length, count: matching })}
        </p>
        <div className="overflow-x-auto">
          <table
            className="w-full min-w-[44rem] border-collapse text-left text-sm"
            data-testid="sales-table"
          >
            <thead>
              <tr className="border-b border-race-line text-xs font-semibold uppercase tracking-wide text-race-dim">
                <th className={th}>{t("colNumber")}</th>
                <th className={th}>{t("colTime")}</th>
                <th className={th}>{t("colItems")}</th>
                <th className={`${th} text-right`}>{t("colTotal")}</th>
                <th className={th}>{t("colCreator")}</th>
                <th className={th}>{t("colStatus")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((sale) => (
                <tr key={sale.id} className="border-b border-race-line/40">
                  <td className={td}>
                    <Link
                      href={{
                        pathname: "/kancelar/prodejky/[id]",
                        params: { id: String(sale.id) },
                      }}
                      className="font-semibold text-race-accent hover:underline"
                    >
                      {sale.number}
                    </Link>
                    <div className="font-mono text-[11px] text-race-muted">{sale.vs}</div>
                  </td>
                  <td className={`${td} whitespace-nowrap`} title={pragueDay(sale.createdAt)}>
                    {when(sale.createdAt)}
                  </td>
                  <td className={td}>
                    {sale.lines.map((l) => (
                      <div key={l.id}>
                        {l.quantity}× {l.name}
                      </div>
                    ))}
                  </td>
                  <td className={`${td} text-right font-semibold tabular-nums`}>
                    {czk(sale.total)}
                  </td>
                  <td className={td}>{sale.createdByName}</td>
                  <td className={td}>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${saleStatusClass(sale.status)}`}
                    >
                      {t(`status_${sale.status}`)}
                    </span>
                    {sale.paidAt ? (
                      <div className="mt-1 text-[11px] text-race-muted">
                        {sale.paidByName === "fio" ? t("paidByFio") : sale.paidByName},{" "}
                        {when(sale.paidAt)}
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}

export const dynamic = "force-dynamic";
