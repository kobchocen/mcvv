"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { createTestOnsiteAction } from "@/lib/testmode/actions";

type Category = { id: string; name: string };

const input = "h-11 w-full border border-race-line/60 bg-race-deep px-3 text-base";
const label = "grid gap-1 text-sm";

/**
 * Pokladna v testovacím režimu (B+): testovací dohláška jen do `mcvv_test_*`. Platba je
 * simulovaná (hotově / QR TEST), žádná ostrá přihláška, prodejka ani e-mail.
 */
export function McvvTestOnsiteForm({ categories }: Readonly<{ categories: Category[] }>) {
  const t = useTranslations("TestMode");
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = (form: HTMLFormElement) => {
    const data = new FormData(form);
    const value = (key: string) => String(data.get(key) ?? "");
    setMessage(null);
    startTransition(async () => {
      const result = await createTestOnsiteAction({
        firstName: value("firstName"),
        lastName: value("lastName"),
        birthYear: value("birthYear"),
        sex: value("sex"),
        categoryId: value("categoryId"),
        clubName: value("clubName"),
        bib: value("bib"),
        payment: value("payment"),
      });
      if (result.ok) {
        form.reset();
        setMessage({ ok: true, text: t("onsiteDone", { bib: result.bib }) });
      } else {
        setMessage({ ok: false, text: t(`onsiteError.${result.error}` as never) });
      }
    });
  };

  return (
    <details
      open
      className="border-2 border-amber-500 bg-race-surface"
      data-testid="test-onsite-entry"
    >
      <summary className="cursor-pointer select-none px-4 py-3 font-display text-lg font-semibold">
        {t("onsiteTitle")}
      </summary>
      <form
        className="grid gap-3 border-t border-race-line/60 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          submit(event.currentTarget);
        }}
      >
        <p className="text-xs text-race-muted">{t("onsiteIntro")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className={label}>
            {t("onsiteLastName")}
            <input name="lastName" required maxLength={39} className={input} autoComplete="off" />
          </label>
          <label className={label}>
            {t("onsiteFirstName")}
            <input name="firstName" required maxLength={40} className={input} autoComplete="off" />
          </label>
          <label className={label}>
            {t("onsiteBirthYear")}
            <input
              name="birthYear"
              required
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              className={input}
            />
          </label>
          <label className={label}>
            {t("onsiteSex")}
            <select name="sex" required className={input} defaultValue="M">
              <option value="M">M</option>
              <option value="F">F</option>
            </select>
          </label>
          <label className={label}>
            {t("onsiteCategory")}
            <select name="categoryId" required className={input}>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            {t("onsiteClub")}
            <input name="clubName" maxLength={80} className={input} autoComplete="off" />
          </label>
          <label className={label}>
            {t("onsiteBib")}
            <input
              name="bib"
              inputMode="numeric"
              pattern="\d{1,4}"
              maxLength={4}
              className={input}
              autoComplete="off"
            />
          </label>
          <label className={label}>
            {t("onsitePayment")}
            <select name="payment" className={input} defaultValue="sim_cash">
              <option value="sim_cash">{t("payment.sim_cash")}</option>
              <option value="sim_qr">{t("payment.sim_qr")}</option>
            </select>
          </label>
        </div>
        {message ? (
          <p
            role={message.ok ? "status" : "alert"}
            className={
              message.ok
                ? "text-sm font-semibold text-race-accent"
                : "text-sm font-semibold text-red-600 dark:text-red-400"
            }
          >
            {message.text}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending}
          className="h-12 bg-amber-600 font-display text-lg font-bold text-white hover:bg-amber-700 disabled:opacity-40"
        >
          {t("onsiteCreate")}
        </button>
      </form>
    </details>
  );
}
