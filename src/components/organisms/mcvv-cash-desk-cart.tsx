"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { useRouter } from "@/i18n/routing";
import { cancelSale, changeCartLineAction, checkoutCartAction } from "@/lib/sales/actions";
import { cartTotals } from "@/lib/sales/cart-core";
import { ONSITE_SALE_LINE_LABEL } from "@/lib/sales/onsite-core";
import { RECEIPT_LOCALES } from "@/lib/sales/receipt-mail";

export type CashDeskCart = {
  id: number;
  number: number;
  vs: string;
  email: string | null;
  locale: string | null;
  lines: {
    id: number;
    name: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    entry: boolean;
  }[];
};

const czk = (value: number) => `${value.toLocaleString("cs-CZ")} Kč`;
const small =
  "h-11 min-w-11 border border-race-line/60 bg-race-surface px-2 font-display text-xl font-semibold disabled:opacity-40";

/**
 * Otevřená prodejka – košík pokladny (#378): dohlášky i položky ceníku, úpravy řádků, e-mail
 * účtenky a „K platbě“. Součet je tu jen průběžný; QR a tlačítka platby ukáže až detail
 * prodejky po uzavření.
 */
export function McvvCashDeskCart({ cart }: { cart: CashDeskCart | null }) {
  const t = useTranslations("CashDesk");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState(cart?.email ?? "");
  const [locale, setLocale] = useState(cart?.locale ?? "cs");
  const [emailFor, setEmailFor] = useState<string | null>(cart?.email ?? null);
  // E-mail z první dohlášky se do pole doplní, dokud ho pokladní sám nezměnil.
  if ((cart?.email ?? null) !== emailFor) {
    setEmailFor(cart?.email ?? null);
    if (email === "" && cart?.email) setEmail(cart.email);
  }

  if (!cart || cart.lines.length === 0) {
    return (
      <section
        className="grid gap-1 border border-dashed border-race-line bg-race-surface p-4"
        data-testid="cart"
        data-cart-id={cart?.id ?? ""}
        id="kosik"
      >
        <h2 className="font-display text-lg font-semibold">
          {cart ? t("saleTitle", { number: cart.number }) : t("cartNew")}
        </h2>
        <p className="text-sm text-race-muted" data-testid="cart-empty">
          {t("cartEmpty")}
        </p>
      </section>
    );
  }

  const totals = cartTotals(cart.lines);
  const change = (lineId: number, op: "inc" | "dec" | "remove") => {
    setError(null);
    startTransition(async () => {
      const result = await changeCartLineAction({ saleId: cart.id, lineId, op });
      if (!result.ok) setError(t(`cartError_${result.error}`));
      router.refresh();
    });
  };
  const checkout = () => {
    setError(null);
    startTransition(async () => {
      const result = await checkoutCartAction({ saleId: cart.id, email, locale });
      if (result.ok) {
        router.push({ pathname: "/kancelar/prodejky/[id]", params: { id: String(cart.id) } });
        return;
      }
      setError(t(`cartError_${result.error}`));
      router.refresh();
    });
  };

  return (
    <section
      className="grid gap-3 border border-race-accent/70 bg-race-surface p-3 sm:p-4"
      data-testid="cart"
      data-cart-id={cart.id}
      id="kosik"
      aria-label={t("cartAria")}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-lg font-semibold">
          {t("saleTitle", { number: cart.number })}
        </h2>
        <span className="rounded-full border border-amber-500/70 px-2 py-0.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
          {t("status_open")}
        </span>
        <span className="ml-auto text-xs text-race-muted">
          {t("cartCounts", { runners: totals.runners, lines: cart.lines.length })}
        </span>
      </div>
      <ul className="grid gap-1" data-testid="cart-lines">
        {cart.lines.map((line) => (
          <li
            key={line.id}
            className="grid grid-cols-[1fr_auto] items-center gap-2 border border-race-line/50 bg-race-deep px-2 py-1.5"
            data-testid={line.entry ? "cart-runner" : "cart-item"}
          >
            <span className="min-w-0 text-sm">
              {line.entry ? (
                <span className="mr-1.5 rounded-sm bg-race-accent/15 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-race-accent">
                  {t("cartRunner")}
                </span>
              ) : null}
              <span className="break-words">
                {line.entry ? line.name.replace(`${ONSITE_SALE_LINE_LABEL} – `, "") : line.name}
              </span>
              <span className="block text-xs text-race-muted tabular-nums">
                {line.quantity > 1 ? `${line.quantity} × ${czk(line.unitPrice)} = ` : ""}
                <span className="font-semibold text-foreground dark:text-white">
                  {czk(line.lineTotal)}
                </span>
              </span>
            </span>
            <span className="flex items-center gap-1">
              {line.entry ? null : (
                <>
                  <button
                    type="button"
                    className={small}
                    disabled={pending}
                    onClick={() => change(line.id, "dec")}
                    aria-label={t("removeOne", { name: line.name })}
                  >
                    −
                  </button>
                  <span className="w-7 text-center font-display text-lg font-bold tabular-nums">
                    {line.quantity}
                  </span>
                  <button
                    type="button"
                    className={small}
                    disabled={pending}
                    onClick={() => change(line.id, "inc")}
                    aria-label={t("addOne", { name: line.name })}
                  >
                    +
                  </button>
                </>
              )}
              <button
                type="button"
                className="h-11 border border-red-500/50 px-2 text-xs font-semibold text-red-600 disabled:opacity-40 dark:text-red-400"
                disabled={pending}
                onClick={() => change(line.id, "remove")}
                aria-label={t("cartRemoveAria", { name: line.name })}
                data-testid="cart-remove"
              >
                {t("cartRemove")}
              </button>
            </span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs text-race-muted" data-testid="cart-split">
          {t("cartSplit", { entries: czk(totals.entries), merch: czk(totals.merch) })}
        </span>
        <span
          className="font-display text-3xl font-bold tabular-nums text-foreground dark:text-white"
          data-testid="cart-sum"
        >
          {czk(totals.total)}
        </span>
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-2">
        <input
          type="email"
          inputMode="email"
          autoComplete="off"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          maxLength={128}
          placeholder={t("receiptEmailPlaceholder")}
          aria-label={t("receiptEmail")}
          className="h-11 border border-race-line/60 bg-race-deep px-2 text-sm"
          data-testid="cart-receipt-email"
        />
        <select
          value={locale}
          onChange={(event) => setLocale(event.target.value)}
          aria-label={t("receiptLocale")}
          className="h-11 border border-race-line/60 bg-race-deep px-2 text-sm"
        >
          {RECEIPT_LOCALES.map((code) => (
            <option key={code} value={code}>
              {code.toUpperCase()}
            </option>
          ))}
        </select>
      </div>
      <p className="text-xs text-race-muted">{t("cartReceiptHint")}</p>
      {error ? (
        <p role="alert" className="text-sm font-semibold text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        onClick={checkout}
        disabled={pending}
        className="h-14 bg-race-accent-solid font-display text-xl font-bold text-white hover:bg-race-accent-solid-hover disabled:opacity-40"
        data-testid="cart-checkout"
      >
        {pending ? t("saving") : t("cartCheckout", { price: czk(totals.total) })}
      </button>
      <form
        action={cancelSale}
        className="flex flex-wrap items-center justify-end gap-3 text-sm"
        data-testid="cart-cancel"
      >
        <input type="hidden" name="id" value={cart.id} />
        <label className="flex items-center gap-2">
          <input type="checkbox" name="confirm" value="1" required className="h-5 w-5" />
          {t("cartCancelConfirm")}
        </label>
        <button
          type="submit"
          className="h-11 border border-red-500/60 px-3 font-semibold text-red-600 dark:text-red-400"
        >
          {t("cancel")}
        </button>
      </form>
    </section>
  );
}
