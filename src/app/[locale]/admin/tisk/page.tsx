import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";

import { McvvAdminHomeLink } from "@/components/organisms";
import { Button } from "@/components/ui/button";
import { requireStaff } from "@/lib/admin/staff";
import { prisma } from "@/lib/db/client";
import { currentRaceYear } from "@/lib/entries/year";
import { type Locale } from "@/i18n/routing";
import { DEFAULT_CHAMPION_BIBS } from "@/lib/print/bib-start";
import { BIB_PARTNER_CATEGORIES, DEFAULT_BATCH } from "@/lib/print/bibs-core";

type PageProps = Readonly<{ params: Promise<{ locale: string }> }>;

export const metadata: Metadata = { title: "Tisk startovních čísel" };
export const dynamic = "force-dynamic";

const ACTION = "/api/admin/tisk/cisla";
const input = "h-9 rounded border border-race-line bg-transparent px-2 text-sm";
const label = "flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-race-dim";
const card = "border border-race-line/55 bg-race-surface p-5";

function ChampionField() {
  return (
    <label className={label}>
      Červená čísla (obhájci)
      <input
        name="red"
        defaultValue={DEFAULT_CHAMPION_BIBS.join(", ")}
        className={`${input} w-40`}
        aria-label="Červená čísla obhájců"
      />
    </label>
  );
}

export default async function AdminPrintBibsPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  await requireStaff();
  const { year } = await currentRaceYear();
  const [numbered, partners] = await Promise.all([
    prisma.registrationLine.count({ where: { year, bib: { gt: 0 } } }),
    prisma.sponsor.findMany({
      where: { active: true, category: { in: [...BIB_PARTNER_CATEGORIES] } },
      orderBy: [{ category: "asc" }, { order: "asc" }, { id: "asc" }],
      select: { id: true, name: true },
    }),
  ]);
  const batches = Array.from({ length: Math.ceil(numbered / DEFAULT_BATCH) }, (_, index) => ({
    offset: index * DEFAULT_BATCH,
    to: Math.min(numbered, (index + 1) * DEFAULT_BATCH),
  }));

  return (
    <main className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <McvvAdminHomeLink label="Administrace" />
        <h1 className="font-display text-3xl font-bold text-foreground dark:text-white">
          Tisk startovních čísel {year}
        </h1>
        <p className="mt-3 max-w-3xl text-sm text-race-muted">
          PDF na A4, dvě čísla na stránku (tisk 100 %, bez přizpůsobení). Číslo černě, veterán
          zeleně s počtem startů, obhájci červeně. Čárový kód Code 128 svisle stejně jako legacy
          tisk. Reklamní pruh: logo partnera kategorie 1–2 podle čísla % počet log (
          {partners.length} {partners.length === 1 ? "logo" : "log"}
          {partners.length ? `: ${partners.map((p) => p.name).join(", ")}` : ""}). Startovní čas:
          nula 10:15:00, 2. start od čísla 601, interval z ročníku.
        </p>

        <section className={`mt-8 ${card}`}>
          <h2 className="font-display text-xl font-semibold">Celá startovka (po dávkách)</h2>
          <p className="mt-1 text-sm text-race-muted">
            Přidělených čísel v ročníku {year}: <strong>{numbered}</strong>.
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
            <ChampionField />
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
            <ChampionField />
            <Button type="submit">Stáhnout PDF</Button>
          </form>
        </section>

        <section className={`mt-6 ${card}`}>
          <h2 className="font-display text-xl font-semibold">Prázdná čísla (rezerva)</h2>
          <p className="mt-1 text-sm text-race-muted">
            Čísla bez jména pro přihlášky na místě: číslo, start, čárový kód a místo na jméno.
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
      </div>
    </main>
  );
}
