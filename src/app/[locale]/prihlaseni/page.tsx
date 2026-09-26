import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { RaceBrand } from "@/components/atoms";
import { McvvLoginForm } from "@/components/organisms/mcvv-login-form";
import { McvvOauthButtons } from "@/components/organisms/mcvv-oauth-buttons";
import { appleEnabled, googleEnabled } from "@/lib/auth/oauth";
import { redirectAfterLogin, safeAdminNext } from "@/lib/auth/login-next";
import { getSession, isStaffRole } from "@/lib/auth/session";
import { Link } from "@/i18n/routing";
import { type Locale } from "@/i18n/routing";
import type { McvvHomepageContent } from "@/components/templates";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string }>;
}>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale: requestedLocale } = await params;
  const t = await getTranslations({ locale: requestedLocale as Locale, namespace: "Auth" });
  return { title: t("title") };
}

export default async function LoginPage({ params, searchParams }: PageProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);

  const { next: nextParam } = await searchParams;
  const next = safeAdminNext(nextParam);
  const session = await getSession();

  if (session) {
    redirectAfterLogin(next, isStaffRole(session.role), locale);
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
          {copy("title")}
        </h1>
        <div className="mt-8">
          <McvvLoginForm
            copy={{
              email: copy("email"),
              password: copy("password"),
              submit: copy("submit"),
              error: copy("error"),
              unverified: copy("unverified"),
              resend: copy("resend"),
              sent: copy("verifySent"),
            }}
            next={next}
          />
          <McvvOauthButtons
            locale={locale}
            next={next}
            google={googleEnabled()}
            apple={appleEnabled()}
            copy={{ google: copy("google"), apple: copy("apple") }}
          />
          <p className="mt-6 text-sm text-race-muted">
            <Link href="/registrace" className="font-medium text-race-accent hover:underline">
              {copy("registerTitle")}
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}

export const dynamic = "force-dynamic";
