"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import {
  NationalitySelect,
  type NationalityField,
} from "@/components/molecules/nationality-select";
import { useRouter } from "@/i18n/routing";
import { defaultCategory, eligibleCategoriesFor } from "@/lib/entries/category";
import { HOME_COUNTRY } from "@/lib/runner/nationality";
import { createOnsiteEntryAction, suggestOnsiteBibAction } from "@/lib/sales/actions";
import { onsiteReceiptEmail } from "@/lib/sales/onsite-core";
import { RECEIPT_LOCALES } from "@/lib/sales/receipt-mail";

type OnsiteCategory = { id: string; name: string; sex: string; age: number; fee: number };

const czk = (value: number) => `${value.toLocaleString("cs-CZ")} Kč`;
const input = "h-12 w-full border border-race-line/60 bg-race-deep px-3 text-base";
const label = "grid gap-1 text-sm";

/**
 * Pokladna – dohláška na místě (#222): údaje běžce, kategorie a startovní číslo. Číslo systém
 * navrhne (nejbližší volné ve startovní řadě kategorie), pokladní ho smí přepsat; nechaný
 * návrh se při uložení vybere znovu pod zámkem (souběžné pokladny). Vytvoří přihlášku
 * s rezervovaným číslem a prodejku s cenou termínu „na místě“; pak detail prodejky s QR.
 */
export function McvvOnsiteEntryForm({
  year,
  categories,
  nationality,
}: {
  year: number;
  categories: OnsiteCategory[];
  nationality: NationalityField;
}) {
  const t = useTranslations("CashDesk");
  const router = useRouter();
  const [birthYear, setBirthYear] = useState("");
  const [sex, setSex] = useState<"" | "M" | "F">("");
  const [categoryId, setCategoryId] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Účtenka (#223): předvyplněná e-mailem běžce, dokud ji pokladní nezmění nebo nesmaže.
  const [entryEmail, setEntryEmail] = useState("");
  const [receiptOverride, setReceiptOverride] = useState<string | null>(null);
  const [receiptLang, setReceiptLang] = useState("cs");
  const receiptEmail = onsiteReceiptEmail(entryEmail, receiptOverride);
  const [pending, startTransition] = useTransition();

  const eligible = useMemo(() => {
    const born = Number(birthYear);
    if (!sex || !/^\d{4}$/.test(birthYear)) return [];
    return eligibleCategoriesFor(born, sex, year, categories);
  }, [birthYear, sex, year, categories]);
  const selected =
    eligible.find((category) => category.id === categoryId) ?? defaultCategory(eligible);
  const selectedId = selected?.id ?? "";
  const [bib, setBib] = useState("");
  const [suggested, setSuggested] = useState<{ bib: number; outsideCategory: boolean } | null>(
    null,
  );
  const lastSuggested = useRef("");
  // Návrh čísla pro vybranou kategorii; ručně přepsané číslo se nepřepisuje.
  useEffect(() => {
    if (!selectedId) return;
    let active = true;
    void suggestOnsiteBibAction(selectedId).then((next) => {
      if (!active) return;
      const previous = lastSuggested.current;
      const value = next ? String(next.bib) : "";
      setBib((current) => (current === "" || current === previous ? value : current));
      lastSuggested.current = value;
      setSuggested(next);
    });
    return () => {
      active = false;
    };
  }, [selectedId]);
  const bibAuto = suggested !== null && bib === String(suggested.bib);

  const submit = (form: HTMLFormElement) => {
    setError(null);
    const data = new FormData(form);
    const value = (key: string) => String(data.get(key) ?? "");
    startTransition(async () => {
      const result = await createOnsiteEntryAction({
        firstName: value("firstName"),
        lastName: value("lastName"),
        birthYear: value("birthYear"),
        sex: value("sex"),
        categoryId: selected?.id ?? "",
        clubName: value("clubName"),
        nationality: value("nationality") || HOME_COUNTRY,
        bib: value("bib"),
        bibAuto: bibAuto ? "1" : "0",
        email: value("email"),
        receiptEmail,
        receiptLocale: receiptLang,
      });
      if (result.ok) {
        router.push({ pathname: "/kancelar/prodejky/[id]", params: { id: String(result.saleId) } });
        return;
      }
      setError(
        result.error === "invalid"
          ? t(`onsiteInvalid_${result.field}`)
          : t(`onsite_${result.error}`),
      );
    });
  };

  return (
    <details className="border border-race-line/60 bg-race-surface" data-testid="onsite-entry">
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
            <input name="lastName" required maxLength={50} className={input} autoComplete="off" />
          </label>
          <label className={label}>
            {t("onsiteFirstName")}
            <input name="firstName" required maxLength={50} className={input} autoComplete="off" />
          </label>
          <label className={label}>
            {t("onsiteBirthYear")}
            <input
              name="birthYear"
              required
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              value={birthYear}
              onChange={(event) => setBirthYear(event.target.value.trim())}
              className={input}
            />
          </label>
          <fieldset className={label}>
            <legend className="mb-1">{t("onsiteSex")}</legend>
            <div className="flex gap-4">
              {(["M", "F"] as const).map((value) => (
                <label key={value} className="flex h-12 items-center gap-2">
                  <input
                    type="radio"
                    name="sex"
                    value={value}
                    required
                    checked={sex === value}
                    onChange={() => setSex(value)}
                    className="h-5 w-5"
                  />
                  {t(value === "M" ? "onsiteSexM" : "onsiteSexF")}
                </label>
              ))}
            </div>
          </fieldset>
          <label className={label}>
            {t("onsiteCategory")}
            <select
              name="categoryId"
              required
              value={selected?.id ?? ""}
              onChange={(event) => setCategoryId(event.target.value)}
              disabled={eligible.length === 0}
              className={input}
            >
              {eligible.length === 0 ? <option value="">{t("onsiteCategoryHint")}</option> : null}
              {eligible.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name} – {czk(category.fee)}
                </option>
              ))}
            </select>
          </label>
          <label className={label}>
            {nationality.label}
            <NationalitySelect
              id="onsite-nationality"
              field={nationality}
              defaultValue={HOME_COUNTRY}
              className={input}
            />
          </label>
          <label className={label}>
            {t("onsiteClub")}
            <input name="clubName" maxLength={50} className={input} autoComplete="off" />
          </label>
          <label className={label}>
            {t("onsiteEmail")}
            <input
              name="email"
              type="email"
              maxLength={128}
              className={input}
              autoComplete="off"
              value={entryEmail}
              onChange={(event) => setEntryEmail(event.target.value)}
            />
          </label>
          <label className={label}>
            {t("onsiteReceiptEmail")}
            <span className="grid grid-cols-[1fr_auto] gap-2">
              <input
                type="email"
                inputMode="email"
                maxLength={128}
                className={input}
                autoComplete="off"
                value={receiptEmail}
                onChange={(event) => setReceiptOverride(event.target.value)}
                placeholder={t("receiptEmailPlaceholder")}
                data-testid="onsite-receipt-email"
              />
              <select
                value={receiptLang}
                onChange={(event) => setReceiptLang(event.target.value)}
                aria-label={t("receiptLocale")}
                className="h-12 border border-race-line/60 bg-race-deep px-2 text-base"
              >
                {RECEIPT_LOCALES.map((code) => (
                  <option key={code} value={code}>
                    {code.toUpperCase()}
                  </option>
                ))}
              </select>
            </span>
            <span className="text-xs text-race-muted">{t("onsiteReceiptEmailHint")}</span>
          </label>
        </div>
        <label className={`${label} sm:max-w-xs`}>
          <span className="font-semibold">{t("onsiteBib")}</span>
          <input
            name="bib"
            inputMode="numeric"
            value={bib}
            onChange={(event) => setBib(event.target.value.trim())}
            pattern="\d{1,4}"
            maxLength={4}
            className={`${input} font-display text-2xl font-bold tabular-nums`}
            autoComplete="off"
            data-testid="onsite-bib"
          />
          <span className="text-xs text-race-muted" data-testid="onsite-bib-hint">
            {suggested
              ? bibAuto
                ? t(suggested.outsideCategory ? "onsiteBibSuggestedOutside" : "onsiteBibSuggested")
                : t("onsiteBibOverride", { bib: suggested.bib })
              : t("onsiteBibHint")}
          </span>
        </label>
        {error ? (
          <p role="alert" className="text-sm font-semibold text-red-600 dark:text-red-400">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending || !selected}
          className="h-14 bg-race-accent-solid font-display text-xl font-bold text-white hover:bg-race-accent-solid-hover disabled:opacity-40"
          data-testid="onsite-create"
        >
          {pending
            ? t("creating")
            : selected
              ? t("onsiteCreate", { price: czk(selected.fee) })
              : t("onsiteCreateNoPrice")}
        </button>
      </form>
    </details>
  );
}
