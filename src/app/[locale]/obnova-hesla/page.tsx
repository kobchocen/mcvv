import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { RaceBrand } from "@/components/atoms";
import { McvvResetPasswordForm } from "@/components/organisms/mcvv-reset-password-form";
import { isTokenShape } from "@/lib/auth/tokens";
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
  return { title: t("resetTitle"), robots: { index: false }, referrer: "no-referrer" };
}

export default async function ResetPasswordPage({ params, searchParams }: PageProps) {
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
          {copy("resetTitle")}
        </h1>
        <div className="mt-8">
          {isTokenShape(token) ? (
            <McvvResetPasswordForm
              token={token}
              copy={{
                password: copy("newPassword"),
                passwordConfirm: copy("newPasswordAgain"),
                submit: copy("resetSubmit"),
                invalid: copy("resetInvalid"),
                short: copy("passwordShort"),
                mismatch: copy("passwordMismatch"),
              }}
            />
          ) : (
            <p role="alert" className="text-base leading-7 text-destructive">
              {copy("resetInvalid")}
            </p>
          )}
          <p className="mt-6 text-sm text-race-muted">
            <Link href="/zapomenute-heslo" className="font-medium text-race-accent hover:underline">
              {copy("forgotLink")}
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}

export const dynamic = "force-dynamic";
