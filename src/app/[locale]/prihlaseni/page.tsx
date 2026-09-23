import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { RaceBrand } from "@/components/atoms";
import { McvvLoginForm } from "@/components/organisms/mcvv-login-form";
import { logout } from "@/lib/auth/actions";
import { getSession, isStaffRole } from "@/lib/auth/session";
import { Link, redirect } from "@/i18n/routing";
import { type Locale } from "@/i18n/routing";
import type { McvvHomepageContent } from "@/components/templates";
import { Button } from "@/components/ui/button";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale: requestedLocale } = await params;
  const t = await getTranslations({ locale: requestedLocale as Locale, namespace: "Auth" });
  return { title: t("title") };
}

export default async function LoginPage({ params }: PageProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);

  const session = await getSession();

  if (session && isStaffRole(session.role)) {
    redirect({ href: "/admin", locale });
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
        {session ? (
          <div className="mt-6 grid gap-4">
            <p className="text-base leading-7 text-race-muted">
              {copy("signedIn", { name: session.name })}
            </p>
            <form action={logout}>
              <Button
                type="submit"
                variant="outline"
                className="h-11 w-full border-race-line bg-race-surface font-display font-semibold"
              >
                {copy("logout")}
              </Button>
            </form>
          </div>
        ) : (
          <div className="mt-8">
            <McvvLoginForm
              copy={{
                email: copy("email"),
                password: copy("password"),
                submit: copy("submit"),
                error: copy("error"),
              }}
            />
          </div>
        )}
      </div>
    </main>
  );
}

export const dynamic = "force-dynamic";
