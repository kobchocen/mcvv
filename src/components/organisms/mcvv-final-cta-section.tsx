import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { McvvHomepageContent } from "@/components/templates/mcvv-homepage-content";

export type McvvFinalCtaSectionProps = {
  content: McvvHomepageContent["finalCta"];
};

export function McvvFinalCtaSection({ content }: McvvFinalCtaSectionProps) {
  return (
    <section id="register" className="bg-race-forest px-4 pb-20 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl bg-race-deep px-6 py-14 text-center sm:px-10 lg:py-20">
        <p className="text-sm font-medium uppercase text-race-muted">MCVV</p>
        <h2 className="mx-auto mt-3 max-w-4xl font-display text-4xl font-bold leading-tight text-foreground dark:text-white sm:text-6xl">
          {content.title}
        </h2>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-race-muted">
          {content.description}
        </p>
        <Button
          asChild
          size="lg"
          className="mt-8 h-12 bg-white px-7 font-display text-base font-bold text-race-deep hover:bg-white/90"
        >
          <Link href="#register">
            {content.cta}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </section>
  );
}
