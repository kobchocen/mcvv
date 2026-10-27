"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";

import { useRouter } from "@/i18n/routing";
import { createSaleAction } from "@/lib/sales/actions";
import { cartTotal, SALE_QTY_MAX } from "@/lib/sales/core";

type Item = { id: number; name: string; price: number };

const czk = (value: number) => `${value.toLocaleString("cs-CZ")} Kč`;

/**
 * Pokladna závodní kanceláře (#207): dlaždice položek, kusy +/−, celková cena a
 * vytvoření prodejky. Ceny se na serveru přepočítají z ceníku (tady jen zobrazení).
 */
export function McvvCashDeskClient({ items }: { items: Item[] }) {
  const t = useTranslations("CashDesk");
  const router = useRouter();
  const [qty, setQty] = useState<Record<number, number>>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const total = useMemo(() => cartTotal(items, qty), [items, qty]);
  const count = Object.values(qty).reduce((sum, q) => sum + q, 0);

  const change = (id: number, delta: number) => {
    setError(null);
    setQty((prev) => {
      const next = Math.min(SALE_QTY_MAX, Math.max(0, (prev[id] ?? 0) + delta));
      return { ...prev, [id]: next };
    });
  };

  const submit = () => {
    setError(null);
    const lines = Object.entries(qty)
      .filter(([, q]) => q > 0)
      .map(([itemId, quantity]) => ({ itemId: Number(itemId), quantity }));
    startTransition(async () => {
      const result = await createSaleAction({ lines });
      if (result.ok) {
        setQty({});
        router.push({ pathname: "/kancelar/prodejky/[id]", params: { id: String(result.id) } });
      } else {
        setError(t(`error_${result.error}`));
      }
    });
  };

  if (items.length === 0) {
    return (
      <p className="border border-race-line/60 bg-race-surface p-4 text-sm text-race-muted">
        {t("noItems")}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2" data-testid="sale-items">
        {items.map((item) => {
          const q = qty[item.id] ?? 0;
          return (
            <li
              key={item.id}
              className={`grid grid-cols-[1fr_auto] items-center gap-2 border p-2 ${
                q > 0
                  ? "border-race-accent bg-race-accent/10"
                  : "border-race-line/60 bg-race-surface"
              }`}
            >
              <button
                type="button"
                onClick={() => change(item.id, 1)}
                className="min-h-14 text-left"
                aria-label={t("addOne", { name: item.name })}
              >
                <span className="block font-display text-lg font-semibold text-foreground dark:text-white">
                  {item.name}
                </span>
                <span className="block text-sm text-race-muted">{czk(item.price)}</span>
              </button>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => change(item.id, -1)}
                  disabled={q === 0}
                  className="h-12 w-12 border border-race-line/60 bg-race-surface font-display text-2xl font-semibold disabled:opacity-40"
                  aria-label={t("removeOne", { name: item.name })}
                >
                  −
                </button>
                <span
                  className="w-10 text-center font-display text-2xl font-bold tabular-nums"
                  data-testid={`qty-${item.id}`}
                >
                  {q}
                </span>
                <button
                  type="button"
                  onClick={() => change(item.id, 1)}
                  className="h-12 w-12 bg-race-accent-solid font-display text-2xl font-semibold text-white hover:bg-race-accent-solid-hover"
                  aria-label={t("addOne", { name: item.name })}
                >
                  +
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="sticky bottom-0 grid gap-2 border-t border-race-line bg-race-deep/95 pb-3 pt-3 backdrop-blur">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-race-muted">{t("pieces", { count })}</span>
          <span
            className="font-display text-4xl font-bold tabular-nums text-foreground dark:text-white"
            data-testid="cart-total"
          >
            {czk(total)}
          </span>
        </div>
        {error ? (
          <p role="alert" className="text-sm font-semibold text-red-600 dark:text-red-400">
            {error}
          </p>
        ) : null}
        <div className="grid grid-cols-[auto_1fr] gap-2">
          <button
            type="button"
            onClick={() => {
              setQty({});
              setError(null);
            }}
            disabled={count === 0 || pending}
            className="h-14 border border-race-line bg-race-surface px-4 text-sm font-semibold disabled:opacity-40"
          >
            {t("clear")}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={count === 0 || pending}
            className="h-14 bg-race-accent-solid font-display text-xl font-bold text-white hover:bg-race-accent-solid-hover disabled:opacity-40"
            data-testid="create-sale"
          >
            {pending ? t("creating") : t("create")}
          </button>
        </div>
      </div>
    </div>
  );
}
