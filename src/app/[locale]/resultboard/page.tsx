import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Link, type Locale } from "@/i18n/routing";
import { loadResultboardConfig } from "@/lib/live/resultboard";

type PageProps = Readonly<{ params: Promise<{ locale: string }> }>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Resultboard" });
  return { title: t("indexMetaTitle"), robots: { index: false, follow: false } };
}

/** Rozcestník `/resultboard` – odkazy na jednotlivé TV v cíli (Q144). Veřejné, noindex. */
export default async function ResultboardIndexPage({ params }: PageProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "Resultboard" });
  const config = await loadResultboardConfig();
  return (
    <main className="min-h-screen bg-race-deep px-4 py-12 text-foreground">
      <div className="mx-auto max-w-2xl" data-testid="resultboard-index">
        <h1 className="font-display text-3xl font-bold">{t("indexTitle")}</h1>
        <p className="mt-3 text-sm text-race-muted">{t("indexNote")}</p>
        <ul className="mt-8 grid gap-3 sm:grid-cols-2">
          {config.monitors.map((m, i) => (
            <li key={i}>
              <Link
                href={{ pathname: "/resultboard/[tv]", params: { tv: String(i + 1) } }}
                className="block rounded-lg border border-race-line bg-race-surface px-5 py-4 hover:border-race-accent"
              >
                <span className="font-display text-xl font-semibold">
                  {t("indexTv", { n: i + 1 })}
                </span>
                <span className="mt-1 block text-sm text-race-muted">{m.name}</span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-8 text-xs text-race-muted">{t("indexHint")}</p>
      </div>
    </main>
  );
}

export const dynamic = "force-dynamic";
