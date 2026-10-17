import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";

import { McvvNewsletterUnsubscribe } from "@/components/organisms/mcvv-newsletter-unsubscribe";
import { isUnsubscribeToken } from "@/lib/newsletter/unsubscribe";
import { type Locale } from "@/i18n/routing";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
}>;

export const metadata: Metadata = {
  title: "Odhlášení z newsletteru",
  robots: { index: false, follow: false },
};

export default async function NewsletterUnsubscribePage({ params, searchParams }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const { token } = await searchParams;
  return (
    <main className="min-h-screen bg-race-deep px-4 py-24 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl">
        <p className="font-display text-sm font-semibold uppercase tracking-wide text-race-accent">
          MCVV · Malá cena Velké Verandy
        </p>
        <h1 className="mb-6 mt-2 font-display text-3xl font-bold text-foreground dark:text-white">
          Odhlášení z newsletteru
        </h1>
        {isUnsubscribeToken(token) ? (
          <McvvNewsletterUnsubscribe token={token} />
        ) : (
          <p className="text-lg text-red-600 dark:text-red-400">
            Odkaz pro odhlášení je neplatný nebo neúplný.
          </p>
        )}
      </div>
    </main>
  );
}

export const dynamic = "force-dynamic";
