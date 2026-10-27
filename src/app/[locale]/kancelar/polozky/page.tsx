import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { McvvCashDeskForbidden, McvvCashDeskNav } from "@/components/organisms/mcvv-cash-desk-nav";
import type { Locale } from "@/i18n/routing";
import { canManageSaleItems } from "@/lib/auth/roles";
import { currentRaceYear } from "@/lib/entries/year";
import { saveSaleItem, toggleSaleItem } from "@/lib/sales/actions";
import { cashDeskPageSession } from "@/lib/sales/guard";
import { listSaleItems } from "@/lib/sales/sales";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "CashDesk" });
  return { title: t("itemsMetaTitle"), robots: { index: false, follow: false } };
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";
const FLASH_OK = new Set(["created", "updated", "activated", "deactivated"]);
const FLASH_ERR = new Set(["forbidden", "not_found", "name", "price", "order"]);

/** Ceník závodní kanceláře (#207): položky ročníku s cenou, aktivní / neaktivní. Jen admin. */
export default async function SaleItemsPage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const session = await cashDeskPageSession("/kancelar/polozky");
  if (!session || !canManageSaleItems(session.role)) return <McvvCashDeskForbidden />;
  const t = await getTranslations({ locale: locale as Locale, namespace: "CashDesk" });
  const { year } = await currentRaceYear();
  const items = await listSaleItems(year);
  const query = await searchParams;
  const ok = one(query.ok);
  const err = one(query.chyba);
  const field = "h-11 min-w-0 border border-race-line/60 bg-race-deep px-2 text-sm";

  const itemFields = (item?: { name: string; price: number; sortOrder: number }) => (
    <>
      <label className="grid gap-1 text-xs text-race-muted">
        {t("itemName")}
        <input
          name="name"
          required
          maxLength={80}
          defaultValue={item?.name ?? ""}
          className={field}
        />
      </label>
      <label className="grid gap-1 text-xs text-race-muted">
        {t("itemPrice")}
        <input
          name="price"
          required
          inputMode="numeric"
          pattern="[0-9]{1,6}"
          defaultValue={item?.price ?? ""}
          className={`${field} w-28 text-right`}
        />
      </label>
      <label className="grid gap-1 text-xs text-race-muted">
        {t("itemOrder")}
        <input
          name="sortOrder"
          inputMode="numeric"
          defaultValue={item?.sortOrder ?? 0}
          className={`${field} w-20 text-right`}
        />
      </label>
    </>
  );

  return (
    <main className="min-h-screen bg-race-deep text-foreground">
      <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-3 pb-10 pt-4">
        <McvvCashDeskNav session={session} active="items" />
        <p className="text-sm text-race-muted">{t("itemsIntro", { year })}</p>
        {FLASH_OK.has(ok) ? (
          <p
            role="status"
            className="border border-emerald-500/60 bg-emerald-500/10 p-3 text-sm font-semibold"
          >
            {t(`itemFlash_${ok}`)}
          </p>
        ) : null}
        {FLASH_ERR.has(err) ? (
          <p
            role="alert"
            className="border border-red-500/60 p-3 text-sm text-red-600 dark:text-red-400"
          >
            {t(`itemError_${err}`)}
          </p>
        ) : null}

        <section className="grid gap-2 border border-race-line/60 bg-race-surface p-3">
          <h2 className="font-display text-lg font-semibold">{t("itemNew")}</h2>
          <form
            action={saveSaleItem}
            className="grid grid-cols-[1fr_auto_auto] items-end gap-2 sm:grid-cols-[1fr_auto_auto_auto]"
            data-testid="item-new"
          >
            {itemFields()}
            <button
              type="submit"
              className="col-span-3 h-11 bg-race-accent-solid px-4 text-sm font-semibold text-white sm:col-span-1"
            >
              {t("itemAdd")}
            </button>
          </form>
        </section>

        <ul className="grid gap-2" data-testid="item-list">
          {items.length === 0 ? (
            <li className="text-sm text-race-muted">{t("itemsEmpty")}</li>
          ) : null}
          {items.map((item) => (
            <li
              key={item.id}
              className={`grid gap-2 border p-3 ${item.active ? "border-race-line/60 bg-race-surface" : "border-dashed border-race-line/60 opacity-70"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold">
                  {item.name}
                  {!item.active ? (
                    <span className="ml-2 rounded-full border border-race-line px-2 py-0.5 text-[11px] text-race-muted">
                      {t("itemInactive")}
                    </span>
                  ) : null}
                </span>
                <form action={toggleSaleItem}>
                  <input type="hidden" name="id" value={item.id} />
                  <input type="hidden" name="active" value={item.active ? "0" : "1"} />
                  <button
                    type="submit"
                    className="h-9 border border-race-line px-3 text-xs font-semibold"
                  >
                    {item.active ? t("itemDeactivate") : t("itemActivate")}
                  </button>
                </form>
              </div>
              <form
                action={saveSaleItem}
                className="grid grid-cols-[1fr_auto_auto] items-end gap-2 sm:grid-cols-[1fr_auto_auto_auto]"
              >
                <input type="hidden" name="id" value={item.id} />
                {itemFields(item)}
                <button
                  type="submit"
                  className="col-span-3 h-11 border border-race-line bg-race-deep px-4 text-sm font-semibold sm:col-span-1"
                >
                  {t("itemSave")}
                </button>
              </form>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

export const dynamic = "force-dynamic";
