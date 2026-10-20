import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { McvvContactForm } from "@/components/organisms/mcvv-contact-form";
import { McvvPublicNavbar } from "@/components/organisms";
import { Link } from "@/i18n/routing";
import { type Locale } from "@/i18n/routing";
import type { McvvHomepageContent } from "@/components/templates";
import { getSession } from "@/lib/auth/session";
import { issueFormToken } from "@/lib/contact/guard";
import { env } from "@/lib/env";
import { getMessageSettings } from "@/lib/settings/messages";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  const t = await getTranslations({ locale, namespace: "Contact" });
  return { title: t("title") };
}

export default async function ContactPage({ params }: PageProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);

  const home = await getTranslations({ locale, namespace: "Home" });
  const copy = await getTranslations({ locale, namespace: "Contact" });
  const session = await getSession();
  const secret = env.SESSION_SECRET;
  const formToken = secret && secret.length >= 32 ? issueFormToken(secret) : undefined;
  const threadMode = session ? (await getMessageSettings()).enabled : false;

  return (
    <main className="min-h-screen bg-race-deep text-foreground">
      <McvvPublicNavbar
        content={{
          brand: home.raw("brand") as McvvHomepageContent["brand"],
          nav: home.raw("nav") as McvvHomepageContent["nav"],
        }}
        variant="solid"
      />
      <section className="px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="mx-auto grid max-w-3xl gap-6">
          <div className="flex items-center gap-3">
            <span className="h-0.5 w-7 bg-race-accent" />
            <p className="font-display text-xs font-semibold uppercase tracking-[0.14em] text-race-accent">
              {copy("eyebrow")}
            </p>
          </div>
          <h1 className="font-display text-5xl font-bold text-foreground dark:text-white sm:text-6xl">
            {copy("title")}
          </h1>
          <p className="text-base leading-7 text-race-muted">
            {threadMode ? copy("loggedInIntro") : copy("intro")}
          </p>
          <McvvContactForm
            copy={{
              name: copy("name"),
              email: copy("email"),
              message: copy("message"),
              submit: copy("submit"),
              sending: copy("sending"),
              success: copy("success"),
              errorInvalid: copy("errorInvalid"),
              errorSend: copy("errorSend"),
              errorExpired: copy("errorExpired"),
              errorRate: copy("errorRate"),
            }}
            threadMode={threadMode}
            formToken={formToken}
            defaults={session ? { name: session.name, email: session.email } : undefined}
          />
          <p>
            <Link
              href="/"
              className="font-medium text-race-accent underline-offset-2 hover:underline"
            >
              {copy("back")}
            </Link>
          </p>
        </div>
      </section>
    </main>
  );
}
