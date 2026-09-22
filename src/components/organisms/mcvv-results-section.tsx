import { ArrowUpRight } from "lucide-react";

import { RaceResultCard, RunnerSearch, SectionHeader } from "@/components/molecules";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/routing";
import type { McvvHomepageContent } from "@/components/templates/mcvv-homepage-content";

export type McvvResultsSectionProps = {
  content: McvvHomepageContent["results"];
};

export function McvvResultsSection({ content }: McvvResultsSectionProps) {
  return (
    <section id="results" className="bg-race-deep px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <div className="mx-auto max-w-7xl">
        <SectionHeader
          eyebrow={content.eyebrow}
          title={content.title}
          titleClassName="max-w-3xl"
          action={
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
              <div className="relative z-20 w-full sm:w-[18rem]">
                <RunnerSearch
                  placeholder={content.searchPlaceholder}
                  emptyLabel={content.searchEmpty}
                />
              </div>
              <Button
                asChild
                variant="outline"
                className="border-white/15 bg-white/10 font-display font-semibold text-foreground hover:bg-white/15 dark:text-white"
              >
                <Link href={"/results" as never}>{content.allLabel}</Link>
              </Button>
            </div>
          }
        />

        <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(16rem,20rem)_minmax(0,1fr)] lg:items-stretch">
          {content.years.length === 0 ? (
            <p className="text-sm text-race-muted">{content.empty}</p>
          ) : (
            <div className="min-w-0 h-full">
              {content.years.map((result) => (
                <RaceResultCard key={result.year} {...result} />
              ))}
            </div>
          )}

          <div className="grid h-full gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {content.stats.map((stat) => (
              <Link
                key={stat.slug}
                href={
                  {
                    pathname: "/statistiky/[slug]",
                    params: { slug: stat.slug },
                  } as never
                }
                className="group flex h-full flex-col border border-race-line/55 bg-race-surface p-5 transition-colors hover:border-race-accent/50"
              >
                <p className="font-display text-xl font-semibold text-foreground dark:text-white">
                  {stat.title}
                </p>
                <p className="mt-2 flex-1 text-sm leading-6 text-race-muted">{stat.description}</p>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-race-accent">
                  {stat.linkLabel}
                  <ArrowUpRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
