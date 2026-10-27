import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { McvvCashDeskClient } from "@/components/organisms/mcvv-cash-desk-client";
import {
  McvvCashDeskForbidden,
  McvvCashDeskNav,
  saleStatusClass,
} from "@/components/organisms/mcvv-cash-desk-nav";
import { Link, type Locale } from "@/i18n/routing";
import { currentRaceYear } from "@/lib/entries/year";
import { cashDeskPageSession } from "@/lib/sales/guard";
import { listSaleItems, recentSales } from "@/lib/sales/sales";

type PageProps = Readonly<{ params: Promise<{ locale: string }> }>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "CashDesk" });
  return { title: t("metaTitle"), robots: { index: false, follow: false } };
}

const czk = (value: number) => `${value.toLocaleString("cs-CZ")} Kč`;
const time = (d: Date) =>
  d.toLocaleTimeString("cs-CZ", { timeZone: "Europe/Prague", hour: "2-digit", minute: "2-digit" });

/** Pokladna závodní kanceláře (#207): výběr položek a kusů → prodejka s QR platbou. */
export default async function CashDeskPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const session = await cashDeskPageSession("/kancelar");
  if (!session) return <McvvCashDeskForbidden />;
  const t = await getTranslations({ locale: locale as Locale, namespace: "CashDesk" });
  const { year } = await currentRaceYear();
  const [items, recent] = await Promise.all([
    listSaleItems(year, { activeOnly: true }),
    recentSales(year),
  ]);
  return (
    <main className="min-h-screen bg-race-deep text-foreground">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-3 pb-10 pt-4">
        <McvvCashDeskNav session={session} active="desk" />
        <p className="text-xs text-race-muted">{t("deskIntro", { year })}</p>
        <McvvCashDeskClient
          items={items.map((item) => ({ id: item.id, name: item.name, price: item.price }))}
        />
        {recent.length > 0 ? (
          <section aria-label={t("recent")} className="grid gap-1">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-race-muted">
              {t("recent")}
            </h2>
            <ul className="grid gap-1" data-testid="recent-sales">
              {recent.map((sale) => (
                <li key={sale.id}>
                  <Link
                    href={{ pathname: "/kancelar/prodejky/[id]", params: { id: String(sale.id) } }}
                    className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 border border-race-line/50 bg-race-surface px-3 py-2 text-sm"
                  >
                    <span className="tabular-nums text-race-muted">{time(sale.createdAt)}</span>
                    <span className="font-mono text-xs">{sale.vs}</span>
                    <span className="font-semibold tabular-nums">{czk(sale.total)}</span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${saleStatusClass(sale.status)}`}
                    >
                      {t(`status_${sale.status}`)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </main>
  );
}

export const dynamic = "force-dynamic";
