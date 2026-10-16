import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { RaceBrand } from "@/components/atoms";
import { McvvForgotPasswordForm } from "@/components/organisms/mcvv-forgot-password-form";
import { Link } from "@/i18n/routing";
import { type Locale } from "@/i18n/routing";
import type { McvvHomepageContent } from "@/components/templates";

type PageProps = Readonly<{ params: Promise<{ locale: string }> }>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale: requestedLocale } = await params;
  const t = await getTranslations({ locale: requestedLocale as Locale, namespace: "Auth" });
  return { title: t("forgotTitle"), robots: { index: false } };
}

export default async function ForgotPasswordPage({ params }: PageProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
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
          {copy("forgotTitle")}
        </h1>
        <p className="mt-4 text-base leading-7 text-race-muted">{copy("forgotIntro")}</p>
        <div className="mt-8">
          <McvvForgotPasswordForm
            copy={{
              email: copy("email"),
              submit: copy("forgotSubmit"),
              sent: copy("forgotSent"),
              mail: copy("forgotMailMissing"),
            }}
          />
          <p className="mt-6 text-sm text-race-muted">
            <Link href="/prihlaseni" className="font-medium text-race-accent hover:underline">
              {copy("backToLogin")}
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}

export const dynamic = "force-dynamic";
