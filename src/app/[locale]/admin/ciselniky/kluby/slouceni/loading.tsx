import { getTranslations } from "next-intl/server";

import { Spinner } from "@/components/ui/spinner";

/**
 * Načítání stránky sloučení klubů (#192): výpočet návrhů nad všemi výsledky chvíli trvá,
 * po kliknutí na „Načíst další“ / náhled / sloučení je tak hned vidět, že se něco děje.
 */
export default async function AdminClubMergeLoading() {
  const copy = await getTranslations("Admin");
  return (
    <main className="px-4 py-12 sm:px-6 lg:px-8" aria-busy="true">
      <div className="mx-auto max-w-6xl">
        <h1 className="font-display text-3xl font-bold text-foreground dark:text-white">
          {copy("clubMergeTitle")}
        </h1>
        <p
          role="status"
          className="mt-6 flex items-center gap-2 text-sm text-race-muted"
          data-testid="club-merge-loading"
        >
          <Spinner className="size-5" aria-hidden />
          {copy("clubMergeLoading")}
        </p>
        <div className="mt-6 flex flex-col gap-3" aria-hidden>
          {[0, 1, 2].map((key) => (
            <div
              key={key}
              className="h-28 animate-pulse border border-race-line/55 bg-race-surface"
            />
          ))}
        </div>
      </div>
    </main>
  );
}
