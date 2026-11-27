import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { McvvCashDeskCart } from "@/components/organisms/mcvv-cash-desk-cart";
import { McvvCashDeskClient } from "@/components/organisms/mcvv-cash-desk-client";
import { McvvOnsiteEntryForm } from "@/components/organisms/mcvv-onsite-entry-form";
import { McvvTestOnsiteForm } from "@/components/organisms/mcvv-test-onsite-form";
import {
  McvvCashDeskForbidden,
  McvvCashDeskNav,
  saleStatusClass,
} from "@/components/organisms/mcvv-cash-desk-nav";
import { Link, type Locale } from "@/i18n/routing";
import { currentRaceYear } from "@/lib/entries/year";
import { nationalityField } from "@/lib/runner/nationality-field";
import { findOpenCart } from "@/lib/sales/cart";
import { isSaleOpen } from "@/lib/sales/cart-core";
import { cashDeskPageSession } from "@/lib/sales/guard";
import { loadOnsiteEntryOptions } from "@/lib/sales/onsite";
import { listSaleItems, recentSales } from "@/lib/sales/sales";
import { loadTestOnsiteDesk } from "@/lib/testmode/desk";

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
const time = (d: Date) =>
  d.toLocaleTimeString("cs-CZ", { timeZone: "Europe/Prague", hour: "2-digit", minute: "2-digit" });

/**
 * Pokladna závodní kanceláře (#207, košík #378): otevřená prodejka nahoře, pod ní dohláška
 * a ceník, které do ní přidávají. „K platbě“ ji uzavře a otevře detail s QR a platbou.
 */
export default async function CashDeskPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const session = await cashDeskPageSession("/kancelar");
  if (!session) return <McvvCashDeskForbidden />;
  const t = await getTranslations({ locale: locale as Locale, namespace: "CashDesk" });
  const { year } = await currentRaceYear();
  const query = await searchParams;
  const wanted = Array.isArray(query.prodejka) ? query.prodejka[0] : query.prodejka;
  const preferId = wanted && /^\d{1,9}$/.test(wanted) ? Number(wanted) : null;
  const [cart, items, recent, onsite, nationality, testDesk] = await Promise.all([
    findOpenCart(session, year, preferId),
    listSaleItems(year, { activeOnly: true }),
    recentSales(year),
    loadOnsiteEntryOptions(year),
    nationalityField(locale),
    loadTestOnsiteDesk(),
  ]);
  return (
    <main className="min-h-screen bg-race-deep text-foreground">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-3 pb-10 pt-4">
        <McvvCashDeskNav session={session} active="desk" />
        {/* Testovací režim (B+): testovací dohláška jen do mcvv_test_*, ostrá pokladna beze změny. */}
        {testDesk ? <McvvTestOnsiteForm categories={testDesk.categories} /> : null}
        <p className="text-xs text-race-muted">{t("deskIntro", { year })}</p>
        <McvvCashDeskCart
          key={cart?.id ?? "new"}
          cart={
            cart
              ? {
                  id: cart.id,
                  number: cart.number,
                  vs: cart.vs,
                  email: cart.email,
                  locale: cart.locale,
                  lines: cart.lines.map((line) => ({
                    id: line.id,
                    name: line.name,
                    quantity: line.quantity,
                    unitPrice: line.unitPrice,
                    lineTotal: line.lineTotal,
                    entry: line.entry,
                  })),
                }
              : null
          }
        />
        {onsite ? (
          <McvvOnsiteEntryForm
            year={year}
            categories={onsite.categories}
            nationality={nationality}
            saleId={cart?.id ?? null}
          />
        ) : (
          <p className="text-xs text-race-muted">{t("onsiteNoSlot")}</p>
        )}
        <McvvCashDeskClient
          items={items.map((item) => ({ id: item.id, name: item.name, price: item.price }))}
          saleId={cart?.id ?? null}
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
                    href={
                      isSaleOpen(sale)
                        ? { pathname: "/kancelar", query: { prodejka: String(sale.id) } }
                        : { pathname: "/kancelar/prodejky/[id]", params: { id: String(sale.id) } }
                    }
                    className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 border border-race-line/50 bg-race-surface px-3 py-2 text-sm"
                  >
                    <span className="tabular-nums text-race-muted">{time(sale.createdAt)}</span>
                    <span className="font-mono text-xs">{sale.vs}</span>
                    <span className="font-semibold tabular-nums">{czk(sale.total)}</span>
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${saleStatusClass(sale.status)}`}
                    >
                      {t(isSaleOpen(sale) ? "status_open" : `status_${sale.status}`)}
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
