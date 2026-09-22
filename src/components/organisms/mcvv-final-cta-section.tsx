import { ArrowRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/routing";
import type { McvvHomepageContent } from "@/components/templates/mcvv-homepage-content";

export type McvvFinalCtaSectionProps = {
  content: McvvHomepageContent["finalCta"];
};

export function McvvFinalCtaSection({ content }: McvvFinalCtaSectionProps) {
  return (
    <section id="register" className="bg-race-forest px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <div className="mx-auto max-w-7xl px-6 text-center sm:px-10">
        <h2 className="mx-auto max-w-4xl font-display text-4xl font-bold leading-tight text-foreground dark:text-white sm:text-6xl">
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
          <Link href="/prihlasky">
            {content.cta}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </Button>
      </div>
    </section>
  );
}
