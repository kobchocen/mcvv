import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/routing";
import { canManageSaleItems, isStaffRole } from "@/lib/auth/roles";
import type { SessionUser } from "@/lib/auth/session";

type Tab = "desk" | "sales" | "items";

/** Záhlaví závodní kanceláře (#207): přepínání pokladna / prodejky / ceník. */
export async function McvvCashDeskNav({ session, active }: { session: SessionUser; active: Tab }) {
  const t = await getTranslations("CashDesk");
  const tab = (key: Tab) =>
    `flex h-11 items-center justify-center border px-3 text-sm font-semibold ${
      active === key
        ? "border-race-accent bg-race-accent/15 text-foreground dark:text-white"
        : "border-race-line/60 bg-race-surface text-race-muted"
    }`;
  return (
    <header className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h1 className="font-display text-2xl font-bold text-foreground dark:text-white">
          {t("title")}
        </h1>
        <span className="text-xs text-race-muted" data-testid="cash-desk-user">
          {session.name || session.email}
        </span>
      </div>
      <nav className="grid grid-flow-col gap-2" aria-label={t("title")}>
        <Link href="/kancelar" className={tab("desk")} data-testid="tab-desk">
          {t("tabDesk")}
        </Link>
        <Link href="/kancelar/prodejky" className={tab("sales")} data-testid="tab-sales">
          {t("tabSales")}
        </Link>
        {canManageSaleItems(session.role) ? (
          <Link href="/kancelar/polozky" className={tab("items")} data-testid="tab-items">
            {t("tabItems")}
          </Link>
        ) : null}
        {isStaffRole(session.role) ? (
          <Link
            href="/admin"
            className="flex h-11 items-center justify-center border border-race-line/60 bg-race-surface px-3 text-sm font-semibold text-race-muted"
          >
            {t("tabAdmin")}
          </Link>
        ) : null}
      </nav>
    </header>
  );
}

/** Hláška pro přihlášený účet bez oprávnění (jako /mezicasy). */
export async function McvvCashDeskForbidden() {
  const t = await getTranslations("CashDesk");
  return (
    <main className="min-h-screen bg-race-deep px-4 py-16 text-foreground">
      <div className="mx-auto max-w-md" data-testid="cash-desk-forbidden">
        <h1 className="font-display text-2xl font-bold">{t("forbiddenTitle")}</h1>
        <p className="mt-3 text-sm text-race-muted">{t("forbiddenText")}</p>
        <Link
          href="/"
          className="mt-6 inline-block text-sm font-medium text-race-accent hover:underline"
        >
          {t("home")}
        </Link>
      </div>
    </main>
  );
}

/** Barva štítku stavu prodejky. */
export function saleStatusClass(status: string): string {
  if (status === "paid_cash" || status === "paid_bank")
    return "border-emerald-500/60 text-emerald-700 dark:text-emerald-300";
  if (status === "cancelled") return "border-race-line text-race-muted line-through";
  return "border-amber-500/70 text-amber-700 dark:text-amber-300";
}
