import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { RaceBrand } from "@/components/atoms";
import { McvvLoginForm } from "@/components/organisms/mcvv-login-form";
import { McvvResendVerification } from "@/components/organisms/mcvv-resend-verification";
import { McvvOauthButtons } from "@/components/organisms/mcvv-oauth-buttons";
import { appleEnabled, googleEnabled } from "@/lib/auth/oauth";
import { redirectAfterLogin, safeNext } from "@/lib/auth/login-next";
import { getSession } from "@/lib/auth/session";
import { Link } from "@/i18n/routing";
import { type Locale } from "@/i18n/routing";
import type { McvvHomepageContent } from "@/components/templates";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ next?: string; overeni?: string; heslo?: string }>;
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

  const { next: nextParam, overeni, heslo } = await searchParams;
  const verifyInvalid = overeni === "neplatne";
  const next = safeNext(nextParam);
  const session = await getSession();

  if (session) {
    redirectAfterLogin(next, session.role, locale);
  }

  const home = await getTranslations({ locale, namespace: "Home" });
  const copy = await getTranslations({ locale, namespace: "Auth" });
  const brand = home.raw("brand") as McvvHomepageContent["brand"];
  const google = googleEnabled();
  const apple = appleEnabled();
  const oauth = google || apple;

  return (
    <main className="min-h-screen bg-race-deep text-foreground">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4 py-16">
        <Link href="/" aria-label={brand.top}>
          <RaceBrand {...brand} />
        </Link>
        <h1 className="mt-10 font-display text-4xl font-bold text-foreground dark:text-white">
          {copy("title")}
        </h1>
        {heslo === "zmeneno" ? (
          <p
            role="status"
            className="mt-6 rounded-md border border-race-accent/40 bg-race-accent/10 p-4 text-sm leading-6 text-foreground dark:text-white"
          >
            {copy("passwordChanged")}
          </p>
        ) : null}
        {verifyInvalid ? (
          <div
            role="alert"
            className="mt-6 grid gap-4 rounded-md border border-destructive/40 bg-destructive/10 p-4"
          >
            <p className="text-sm leading-6 text-destructive">{copy("verifyInvalid")}</p>
            <McvvResendVerification
              copy={{
                email: copy("email"),
                resend: copy("resend"),
                sent: copy("resendSent"),
                error: copy("mailMissing"),
              }}
            />
          </div>
        ) : null}
        <div className="mt-8">
          {oauth ? (
            <>
              <McvvOauthButtons
                locale={locale}
                next={next}
                google={google}
                apple={apple}
                prominent
                copy={{
                  google: copy("google"),
                  apple: copy("apple"),
                  googleHint: copy("googleHint"),
                }}
              />
              <div className="my-6 flex items-center gap-3 text-xs font-semibold uppercase tracking-wide text-race-dim">
                <span className="h-px flex-1 bg-race-line" />
                {copy("orEmail")}
                <span className="h-px flex-1 bg-race-line" />
              </div>
            </>
          ) : null}
          <McvvLoginForm
            copy={{
              email: copy("email"),
              password: copy("password"),
              submit: copy("submit"),
              error: copy("error"),
              rateLimited: copy("rateLimited"),
              unverified: copy("unverified"),
              resend: copy("resend"),
              sent: copy("verifySent"),
            }}
            next={next}
          />
          <p className="mt-4 text-sm text-race-muted">
            <Link href="/zapomenute-heslo" className="font-medium text-race-accent hover:underline">
              {copy("forgotLink")}
            </Link>
          </p>
          <section
            aria-labelledby="first-time"
            className="mt-6 rounded-md border border-race-accent/40 bg-race-accent/10 p-4"
          >
            <h2
              id="first-time"
              className="font-display text-base font-semibold text-foreground dark:text-white"
            >
              {copy("firstTimeTitle")}
            </h2>
            <p className="mt-1 text-sm leading-6 text-race-muted">{copy("firstTimeText")}</p>
            <Link
              href="/registrace"
              className="mt-3 inline-flex h-10 items-center rounded-md border border-race-accent/60 px-4 font-display text-sm font-semibold text-race-accent transition hover:bg-race-accent/10"
            >
              {copy("firstTimeAction")} →
            </Link>
          </section>
        </div>
      </div>
    </main>
  );
}

export const dynamic = "force-dynamic";
