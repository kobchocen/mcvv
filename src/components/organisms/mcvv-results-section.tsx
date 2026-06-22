import Link from "next/link";

import { RaceResultCard, SectionHeader } from "@/components/molecules";
import { Button } from "@/components/ui/button";
import type { McvvHomepageContent } from "@/components/templates/mcvv-homepage-content";

export type McvvResultsSectionProps = {
  content: McvvHomepageContent["results"];
};

export function McvvResultsSection({ content }: McvvResultsSectionProps) {
  return (
    <section id="results" className="bg-race-forest px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <div className="mx-auto max-w-7xl">
        <SectionHeader
          eyebrow={content.eyebrow}
          title={content.title}
          titleClassName="max-w-3xl"
          action={
            <Button
              asChild
              variant="outline"
              className="border-white/15 bg-white/10 font-display font-semibold text-foreground hover:bg-white/15 dark:text-white"
            >
              <Link href="#results">{content.allLabel}</Link>
            </Button>
          }
        />
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {content.years.map((result) => (
            <RaceResultCard key={result.year} {...result} />
          ))}
        </div>
      </div>
    </section>
  );
}
