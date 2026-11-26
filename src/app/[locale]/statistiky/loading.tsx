import { getTranslations } from "next-intl/server";

import { McvvPublicNavbar } from "@/components/organisms";
import type { McvvHomepageContent } from "@/components/templates";
import { Spinner } from "@/components/ui/spinner";

/** Kosterní načítání /statistiky a /statistiky/[slug] — po kliknutí je hned vidět, že se něco děje. */
export default async function StatsLoading() {
  const home = await getTranslations("Home");
  const t = await getTranslations("Stats.overview");

  return (
    <main className="min-h-screen bg-race-deep text-foreground" aria-busy="true">
      <McvvPublicNavbar
        content={{
          brand: home.raw("brand") as McvvHomepageContent["brand"],
          nav: home.raw("nav") as McvvHomepageContent["nav"],
        }}
        variant="solid"
      />
      <div className="px-4 pb-16 pt-10 sm:px-6 lg:px-8 lg:pt-16">
        <div className="mx-auto max-w-6xl">
          <header>
            <div className="flex items-center gap-3">
              <span className="h-0.5 w-7 bg-race-accent" />
              <div className="h-3 w-40 animate-pulse rounded bg-race-line/70" aria-hidden />
            </div>
            <div
              className="mt-4 h-12 w-4/5 max-w-xl animate-pulse rounded-lg bg-race-line/80 sm:h-16"
              aria-hidden
            />
            <p
              role="status"
              className="mt-4 flex items-center gap-2 text-sm text-race-muted"
              data-testid="stats-loading"
            >
              <Spinner className="size-5" aria-hidden />
              {t("loading")}
            </p>
          </header>

          <div className="-mx-4 mt-8 flex gap-2 overflow-hidden px-4 sm:mx-0 sm:px-0" aria-hidden>
            {Array.from({ length: 8 }, (_, index) => (
              <div
                key={index}
                className="h-9 w-24 shrink-0 animate-pulse rounded-full border border-race-line/70 bg-race-surface/60"
              />
            ))}
          </div>

          <div className="mt-6 grid grid-cols-2 gap-2.5 md:grid-cols-4 md:gap-3" aria-hidden>
            {Array.from({ length: 4 }, (_, index) => (
              <div
                key={index}
                className="h-28 animate-pulse rounded-2xl border border-race-line/70 bg-gradient-to-br from-race-forest-2/70 to-race-surface dark:from-race-forest-2 dark:to-race-forest"
              />
            ))}
          </div>

          <div className="mb-3 mt-8 h-7 w-40 animate-pulse rounded bg-race-line/70" aria-hidden />

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3" aria-hidden>
            {Array.from({ length: 6 }, (_, index) => (
              <div
                key={index}
                className="h-44 animate-pulse rounded-2xl border border-race-line/70 bg-race-surface"
              />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
