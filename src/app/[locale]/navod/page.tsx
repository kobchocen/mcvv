import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ArrowRight } from "lucide-react";

import { McvvFooter, McvvPublicNavbar } from "@/components/organisms";
import { McvvGuideSteps, type GuideStep } from "@/components/organisms/mcvv-guide-steps";
import type { McvvHomepageContent } from "@/components/templates";
import { Button } from "@/components/ui/button";
import { Link, type Locale } from "@/i18n/routing";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale: requestedLocale } = await params;
  const t = await getTranslations({ locale: requestedLocale as Locale, namespace: "Guide" });
  return { title: t("title"), description: t("description") };
}

export default async function GuidePage({ params }: PageProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  const home = await getTranslations({ locale, namespace: "Home" });
  const copy = await getTranslations({ locale, namespace: "Guide" });
  const brand = home.raw("brand") as McvvHomepageContent["brand"];
  const nav = home.raw("nav") as McvvHomepageContent["nav"];
  const steps = copy.raw("steps") as GuideStep[];
  const faq = copy.raw("faq") as { q: string; a: string }[];

  return (
    <main className="min-h-screen bg-race-deep text-foreground">
      <McvvPublicNavbar content={{ brand, nav }} variant="solid" />
      <section className="px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="mx-auto max-w-4xl">
          <div className="flex items-center gap-3">
            <span className="h-0.5 w-7 bg-race-accent" />
            <p className="font-display text-xs font-semibold uppercase tracking-[0.14em] text-race-accent">
              {copy("eyebrow")}
            </p>
          </div>
          <h1 className="mt-5 font-display text-4xl font-bold text-foreground sm:text-5xl dark:text-white">
            {copy("title")}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-race-muted">{copy("lead")}</p>

          <div className="mt-8 border border-race-line/60 bg-race-surface p-3 sm:p-4">
            <p className="mb-3 font-display text-sm font-semibold text-foreground dark:text-white">
              {copy("videoLabel")}
            </p>
            {/* Vertical version on phones, landscape from sm up. preload=metadata keeps it light. */}
            <video
              className="mx-auto block max-h-[80vh] w-full max-w-sm bg-black sm:hidden"
              controls
              playsInline
              preload="metadata"
              poster="/navod/navod-1080x1920.jpg"
              aria-label={copy("videoLabel")}
            >
              <source src="/navod/navod-1080x1920.mp4" type="video/mp4" />
            </video>
            <video
              className="hidden w-full bg-black sm:block"
              controls
              playsInline
              preload="metadata"
              poster="/navod/navod-1920x1080.jpg"
              aria-label={copy("videoLabel")}
            >
              <source src="/navod/navod-1920x1080.mp4" type="video/mp4" />
            </video>
          </div>

          <h2 className="mt-12 font-display text-2xl font-semibold text-foreground sm:text-3xl dark:text-white">
            {copy("stepsTitle")}
          </h2>
          <div className="mt-5">
            <McvvGuideSteps
              steps={steps}
              copy={{
                prev: copy("prev"),
                next: copy("next"),
                done: copy("done"),
                counter: copy.raw("counter") as string,
                stepLabel: copy("stepLabel"),
              }}
            />
          </div>

          <div className="mt-10 flex flex-col gap-3 border border-race-accent/40 bg-race-accent/10 p-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="font-display text-lg font-semibold text-foreground dark:text-white">
              {copy("ctaTitle")}
            </p>
            <Button
              asChild
              className="h-11 bg-race-accent-solid px-6 font-display font-semibold text-white hover:bg-race-accent-solid-hover"
            >
              <Link href="/prihlasky">
                {copy("cta")}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>

          <h2 className="mt-12 font-display text-2xl font-semibold text-foreground sm:text-3xl dark:text-white">
            {copy("faqTitle")}
          </h2>
          <div className="mt-4 grid gap-2">
            {faq.map((item) => (
              <details
                key={item.q}
                className="border border-race-line/60 bg-race-surface px-4 py-3 open:pb-4"
              >
                <summary className="cursor-pointer font-semibold text-foreground dark:text-white">
                  {item.q}
                </summary>
                <p className="mt-2 text-sm leading-6 text-race-muted">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
      <McvvFooter
        content={{ brand, footer: home.raw("footer") as McvvHomepageContent["footer"] }}
      />
    </main>
  );
}
