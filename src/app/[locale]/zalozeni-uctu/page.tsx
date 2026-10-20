import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { RaceBrand } from "@/components/atoms";
import { McvvSignupInviteForm } from "@/components/organisms/mcvv-signup-invite-form";
import { prisma } from "@/lib/db/client";
import { getSession } from "@/lib/auth/session";
import { readSignupToken } from "@/lib/auth/signup-token";
import { signupSecret } from "@/lib/auth/tokens";
import { Link, redirect } from "@/i18n/routing";
import { type Locale } from "@/i18n/routing";
import type { McvvHomepageContent } from "@/components/templates";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
}>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale: requestedLocale } = await params;
  const t = await getTranslations({ locale: requestedLocale as Locale, namespace: "Auth" });
  return { title: t("signupTitle"), robots: { index: false }, referrer: "no-referrer" };
}

/** Landing page of the one-time link from the "Účet u nás zatím nemáte" e-mail. */
export default async function SignupInvitePage({ params, searchParams }: PageProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  if (await getSession()) {
    redirect({ href: "/prihlasky", locale });
  }
  const { token } = await searchParams;
  const secret = signupSecret();
  const claim = secret ? readSignupToken(token, secret) : null;
  const used = claim ? (await prisma.user.count({ where: { email: claim.email } })) > 0 : false;
  const registrations =
    claim && !used ? await prisma.registration.count({ where: { email: claim.email } }) : 0;

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
          {copy("signupTitle")}
        </h1>
        <div className="mt-8">
          {claim && token && !used ? (
            <>
              <p className="mb-6 text-base leading-7 text-race-muted">
                {copy("signupIntro")}
                {registrations > 0
                  ? ` ${copy("signupRegistrations", { count: registrations })}`
                  : ""}
              </p>
              <McvvSignupInviteForm
                token={token}
                email={claim.email}
                copy={{
                  email: copy("email"),
                  name: copy("name"),
                  clubName: copy("clubName"),
                  password: copy("password"),
                  passwordConfirm: copy("passwordAgain"),
                  passwordHint: copy("passwordHint"),
                  submit: copy("signupSubmit"),
                  invalid: copy("signupInvalid"),
                  used: copy("signupUsed"),
                  signIn: copy("title"),
                  nameMissing: copy("signupNameMissing"),
                  short: copy("passwordShort"),
                  mismatch: copy("passwordMismatch"),
                }}
              />
            </>
          ) : (
            <p role="alert" className="text-base leading-7 text-destructive">
              {used ? copy("signupUsed") : copy("signupInvalid")}
            </p>
          )}
          <p className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-race-muted">
            <Link href="/prihlaseni" className="font-medium text-race-accent hover:underline">
              {copy("backToLogin")}
            </Link>
            {used ? null : (
              <Link
                href="/zapomenute-heslo"
                className="font-medium text-race-accent hover:underline"
              >
                {copy("signupNewLink")}
              </Link>
            )}
          </p>
        </div>
      </div>
    </main>
  );
}

export const dynamic = "force-dynamic";
