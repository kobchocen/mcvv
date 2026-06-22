import Image from "next/image";
import Link from "next/link";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { LanguageSwitcher, ThemeToggle } from "@/components/atoms";
import { buttonVariants } from "@/components/ui";
import { routing, type Locale } from "@/i18n/routing";
import { cn } from "@/lib/utils";

const deployUrl =
  "https://vercel.com/new?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app";
const docsUrl =
  "https://nextjs.org/docs?utm_source=create-next-app&utm_medium=appdir-template-tw&utm_campaign=create-next-app";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export default async function Home({ params }: PageProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "Home" });

  return (
    <div className="min-h-screen bg-gradient-to-b from-muted/40 via-background to-background">
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-16">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
          <p className="text-xs text-muted-foreground">{t("localeHint")}</p>
        </header>

        <section className="rounded-3xl border border-border/70 bg-card/80 p-8 shadow-lg shadow-black/5 backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-primary">
            {t("eyebrow")}
          </p>
          <h1 className="mt-4 text-4xl font-semibold leading-tight tracking-tight text-foreground sm:text-5xl">
            {t("title")}
          </h1>
          <p className="mt-4 text-lg text-muted-foreground">{t("description")}</p>

          <div className="mt-8 flex flex-col gap-4 text-base font-medium sm:flex-row">
            <Link
              className={cn(buttonVariants({ size: "lg" }), "h-12 flex-1 justify-center")}
              href={deployUrl}
              target="_blank"
              rel="noreferrer"
            >
              {t("primaryCta")}
            </Link>
            <Link
              className={cn(
                buttonVariants({ variant: "outline", size: "lg" }),
                "h-12 flex-1 justify-center border-dashed",
              )}
              href={docsUrl}
              target="_blank"
              rel="noreferrer"
            >
              {t("secondaryCta")}
            </Link>
          </div>

          <div className="mt-10 grid gap-6 rounded-2xl border border-border/60 bg-background/80 p-6 sm:grid-cols-[1fr,auto] sm:items-center">
            <div>
              <p className="text-sm text-muted-foreground">{t("announcement")}</p>
            </div>
            <div className="flex flex-col items-center rounded-xl border border-border/70 bg-card/80 p-4 shadow-sm">
              <Image
                className="w-24 dark:brightness-200"
                src="/next.svg"
                alt="Next.js logo"
                width={160}
                height={40}
                priority
              />
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export const dynamicParams = false;
