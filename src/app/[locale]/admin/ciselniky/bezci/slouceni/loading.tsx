import { getTranslations } from "next-intl/server";

import { Spinner } from "@/components/ui/spinner";

/** Načítání stránky sloučení běžců (#261): po náhledu / sloučení / „Načíst další“ je hned vidět průběh. */
export default async function AdminRunnerMergeLoading() {
  const copy = await getTranslations("AdminRunnerMerge");
  return (
    <main className="px-4 py-12 sm:px-6 lg:px-8" aria-busy="true">
      <div className="mx-auto max-w-6xl">
        <h1 className="font-display text-3xl font-bold text-foreground dark:text-white">
          {copy("title")}
        </h1>
        <p
          role="status"
          className="mt-6 flex items-center gap-2 text-sm text-race-muted"
          data-testid="runner-merge-loading"
        >
          <Spinner className="size-5" aria-hidden />
          {copy("loading")}
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
