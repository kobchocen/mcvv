import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Button } from "@/components/ui/button";
import { requireSection } from "@/lib/admin/access";
import { prisma } from "@/lib/db/client";
import { type Locale } from "@/i18n/routing";
import { championBibList } from "@/lib/print/bib-start";
import { BIB_PARTNER_CATEGORIES, DEFAULT_BATCH } from "@/lib/print/bibs-core";
import { loadPrintStartList } from "@/lib/print/load-bibs";
import { formatClock } from "@/lib/race/start-time";
import { staffLocale } from "@/lib/i18n/locale";

type PageProps = Readonly<{ params: Promise<{ locale: string }> }>;

export const metadata: Metadata = { title: "Tisk čísel a sestav" };
export const dynamic = "force-dynamic";

const ACTION = "/api/admin/tisk/cisla";
const REPORTS = "/api/admin/tisk/prezentace";
const START_LIST = "/api/admin/startovka/pdf";
const input = "h-9 rounded border border-race-line bg-transparent px-2 text-sm";
const label = "flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-race-dim";
const card = "border border-race-line/55 bg-race-surface p-5";

function ChampionField({ value }: { value: string }) {
  return (
    <label className={label}>
      Oranžový počet účastí (obhájci mužů a žen)
      <input
        name="red"
        defaultValue={value}
        className={`${input} w-40`}
        aria-label="Čísla obhájců mužů a žen"
      />
    </label>
  );
}

export default async function AdminPrintBibsPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  await requireSection("startlist.print", "read");
  const t = await getTranslations({ locale: locale as Locale, namespace: "PrintReports" });
  const lang = staffLocale(locale);
  const [startList, partners] = await Promise.all([
    loadPrintStartList(),
    prisma.sponsor.findMany({
      where: { active: true, category: { in: [...BIB_PARTNER_CATEGORIES] } },
      orderBy: [{ category: "asc" }, { order: "asc" }, { id: "asc" }],
      select: { id: true, name: true },
    }),
  ]);
  const { year, settings } = startList;
  const { model } = settings;
  const numbered = startList.rows.length;
  const champions = championBibList(settings.champions).join(", ");
  const batches = Array.from({ length: Math.ceil(numbered / DEFAULT_BATCH) }, (_, index) => ({
    offset: index * DEFAULT_BATCH,
    to: Math.min(numbered, (index + 1) * DEFAULT_BATCH),
  }));

  return (
    <main className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="font-display text-3xl font-bold text-foreground dark:text-white">
          Tisk startovních čísel {year}
        </h1>
        <p className="mt-3 max-w-3xl text-sm text-race-muted">
          PDF na A5 na šířku, jedno číslo na stránku (tisk 100 %, bez přizpůsobení). Startovní číslo
          je vždy černé, s bílou linkou profilu tratě. Počet účastí u členů klubu veteránů je forest
          zelený, u obhájců loňského vítězství mužů a žen oranžový. Místo čárového kódu je QR (MCVV
          {year}-číslo). Reklamní pruh: logo partnera kategorie 1–2 podle čísla % počet log (
          {partners.length} {partners.length === 1 ? "logo" : "log"}
          {partners.length ? `: ${partners.map((p) => p.name).join(", ")}` : ""}). Startovní čas
          podle nastavení ročníku: nula {formatClock(model.zeroSeconds)}, 2. start od čísla{" "}
          {model.secondStartFrom}, interval {model.intervalSeconds} s.
        </p>
        {numbered === 0 ? (
          <p
            className="mt-4 max-w-3xl border border-race-line bg-race-surface p-3 text-sm text-foreground"
            role="status"
          >
            Ve startovce ročníku {year} zatím nejsou žádná přidělená startovní čísla, tisk celé
            startovky proto nic nevytvoří. Nejprve přidělte čísla ve Startovce, nebo tiskněte
            prázdná čísla (rezerva). Vybraná čísla lze stáhnout, jen pokud už ve startovce jsou.
          </p>
        ) : null}

        <section className={`mt-8 ${card}`}>
          <h2 className="font-display text-xl font-semibold">Celá startovka (po dávkách)</h2>
          <p className="mt-1 text-sm text-race-muted">
            Čísel ve startovce ročníku {year}: <strong>{numbered}</strong> (jen zaplacené přihlášky
            s číslem, spravované ve Startovce).
          </p>
          <form action={ACTION} method="get" className="mt-4 flex flex-wrap items-end gap-4">
            <input type="hidden" name="mode" value="all" />
            <label className={label}>
              Řazení
              <select name="order" defaultValue="registration" className={`${input} w-52`}>
                <option value="registration">podle přihlášky (legacy)</option>
                <option value="bib">podle čísla</option>
              </select>
            </label>
            <label className={label}>
              Přeskočit
              <input
                name="offset"
                type="number"
                min={0}
                defaultValue={0}
                className={`${input} w-24`}
              />
            </label>
            <label className={label}>
              Počet
              <input
                name="limit"
                type="number"
                min={1}
                max={400}
                defaultValue={DEFAULT_BATCH}
                className={`${input} w-24`}
              />
            </label>
            <ChampionField value={champions} />
            <Button type="submit">Stáhnout PDF</Button>
          </form>
          {batches.length > 1 ? (
            <p className="mt-4 flex flex-wrap gap-3 text-sm">
              {batches.map((batch) => (
                <a
                  key={batch.offset}
                  href={`${ACTION}?mode=all&offset=${batch.offset}&limit=${DEFAULT_BATCH}`}
                  className="font-medium text-race-accent underline-offset-2 hover:underline"
                >
                  {batch.offset + 1}–{batch.to}
                </a>
              ))}
            </p>
          ) : null}
        </section>

        <section className={`mt-6 ${card}`}>
          <h2 className="font-display text-xl font-semibold">Vybraná čísla</h2>
          <p className="mt-1 text-sm text-race-muted">
            Dotisk čísel přihlášených běžců, např. „321, 41-45“.
          </p>
          <form action={ACTION} method="get" className="mt-4 flex flex-wrap items-end gap-4">
            <input type="hidden" name="mode" value="selected" />
            <label className={label}>
              Čísla
              <input name="bibs" required placeholder="321, 41-45" className={`${input} w-72`} />
            </label>
            <ChampionField value={champions} />
            <Button type="submit">Stáhnout PDF</Button>
          </form>
        </section>

        <section className={`mt-6 ${card}`}>
          <h2 className="font-display text-xl font-semibold">Prázdná čísla (rezerva)</h2>
          <p className="mt-1 text-sm text-race-muted">
            Čísla bez jména pro přihlášky na místě: číslo, start, QR kód a místo na jméno.
          </p>
          <form action={ACTION} method="get" className="mt-4 flex flex-wrap items-end gap-4">
            <input type="hidden" name="mode" value="blank" />
            <label className={label}>
              Čísla
              <input
                name="bibs"
                required
                placeholder="381-390, 931-940"
                className={`${input} w-72`}
              />
            </label>
            <Button type="submit">Stáhnout PDF</Button>
          </form>
        </section>

        <section className={`mt-10 ${card}`} data-testid="presentation-reports">
          <h2 className="font-display text-xl font-semibold">{t("heading")}</h2>
          <p className="mt-1 max-w-3xl text-sm text-race-muted">{t("intro", { year })}</p>
          <div className="mt-5 grid gap-6 md:grid-cols-3">
            <form action={REPORTS} method="get" className="flex flex-col gap-3">
              <input type="hidden" name="sestava" value="prihlasky" />
              <input type="hidden" name="lang" value={lang} />
              <h3 className="font-semibold">{t("presentation")}</h3>
              <p className="text-sm text-race-muted">{t("presentationHint")}</p>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="stranky" value="1" />
                {t("pagePerRegistration")}
              </label>
              <Button type="submit" className="self-start">
                {t("download")}
              </Button>
            </form>
            <form action={REPORTS} method="get" className="flex flex-col gap-3">
              <input type="hidden" name="sestava" value="abeceda" />
              <input type="hidden" name="lang" value={lang} />
              <h3 className="font-semibold">{t("alphabet")}</h3>
              <p className="text-sm text-race-muted">{t("alphabetHint")}</p>
              <Button type="submit" className="mt-auto self-start">
                {t("download")}
              </Button>
            </form>
            <form action={START_LIST} method="get" className="flex flex-col gap-3">
              <input type="hidden" name="rok" value={year} />
              <input type="hidden" name="lang" value={lang} />
              <h3 className="font-semibold">{t("startList")}</h3>
              <p className="text-sm text-race-muted">{t("startListHint")}</p>
              <label className={label}>
                {t("order")}
                <select name="razeni" defaultValue="cas" className={`${input} w-56`}>
                  <option value="cas">{t("orderTime")}</option>
                  <option value="cislo">{t("orderBib")}</option>
                </select>
              </label>
              <Button type="submit" className="self-start">
                {t("download")}
              </Button>
            </form>
          </div>
        </section>
      </div>
    </main>
  );
}
