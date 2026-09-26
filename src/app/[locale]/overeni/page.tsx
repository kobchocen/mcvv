import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { RaceBrand } from "@/components/atoms";
import { McvvVerifyClient } from "@/components/organisms/mcvv-verify-client";
import { Link } from "@/i18n/routing";
import { type Locale } from "@/i18n/routing";
import type { McvvHomepageContent } from "@/components/templates";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
}>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale: requestedLocale } = await params;
  const t = await getTranslations({ locale: requestedLocale as Locale, namespace: "Auth" });
  return { title: t("verifyTitle") };
}

export default async function VerifyPage({ params, searchParams }: PageProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  const { token } = await searchParams;
  const home = await getTranslations({ locale, namespace: "Home" });
  const copy = await getTranslations({ locale, namespace: "Auth" });
  const brand = home.raw("brand") as McvvHomepageContent["brand"];

  return (
    <main className="min-h-screen bg-race-deep text-foreground">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-16">
        <Link href="/" aria-label={brand.top}>
          <RaceBrand {...brand} />
        </Link>
        <h1 className="mt-10 font-display text-4xl font-bold text-foreground dark:text-white">
          {copy("verifyTitle")}
        </h1>
        <div className="mt-6">
          {token ? (
            <McvvVerifyClient token={token} errorLabel={copy("verifyError")} />
          ) : (
            <p className="text-base leading-7 text-destructive">{copy("verifyError")}</p>
          )}
        </div>
      </div>
    </main>
  );
}

export const dynamic = "force-dynamic";
