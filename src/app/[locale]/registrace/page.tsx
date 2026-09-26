import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { RaceBrand } from "@/components/atoms";
import { McvvRegisterForm } from "@/components/organisms/mcvv-register-form";
import { McvvOauthButtons } from "@/components/organisms/mcvv-oauth-buttons";
import { appleEnabled, googleEnabled } from "@/lib/auth/oauth";
import { getSession } from "@/lib/auth/session";
import { Link, redirect } from "@/i18n/routing";
import { type Locale } from "@/i18n/routing";
import type { McvvHomepageContent } from "@/components/templates";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale: requestedLocale } = await params;
  const t = await getTranslations({ locale: requestedLocale as Locale, namespace: "Auth" });
  return { title: t("registerTitle") };
}

export default async function RegisterPage({ params }: PageProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  const session = await getSession();
  if (session) {
    redirect({ href: "/", locale });
  }

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
          {copy("registerTitle")}
        </h1>
        <div className="mt-8">
          <McvvRegisterForm
            copy={{
              name: copy("name"),
              clubName: copy("clubName"),
              email: copy("email"),
              password: copy("password"),
              submit: copy("registerSubmit"),
              sent: copy("verifySent"),
              exists: copy("alreadyVerified"),
              mail: copy("mailMissing"),
              generic: copy("registerGeneric"),
              signIn: copy("title"),
            }}
          />
          <McvvOauthButtons
            locale={locale}
            google={googleEnabled()}
            apple={appleEnabled()}
            copy={{ google: copy("google"), apple: copy("apple") }}
          />
        </div>
        <p className="mt-6 text-sm text-race-muted">
          <Link href="/prihlaseni" className="font-medium text-race-accent hover:underline">
            {copy("title")}
          </Link>
        </p>
      </div>
    </main>
  );
}

export const dynamic = "force-dynamic";
