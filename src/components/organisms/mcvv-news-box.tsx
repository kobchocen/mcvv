import { ArrowRight } from "lucide-react";

import { SectionEyebrow } from "@/components/atoms";
import { Link } from "@/i18n/routing";

/** Public homepage news / announcement box (outside the hero CTAs). */
export type McvvNewsBoxContent = {
  eyebrow: string;
  title: string;
  body: string;
  linkLabel: string;
  href: "/souteze-tymu";
};

export type McvvNewsBoxProps = {
  content: McvvNewsBoxContent;
};

export function McvvNewsBox({ content }: McvvNewsBoxProps) {
  return (
    <section
      aria-labelledby="home-news-title"
      data-slot="home-news"
      className="bg-race-forest px-4 py-8 sm:px-6 lg:px-8"
    >
      <div className="mx-auto max-w-7xl">
        <article className="border border-race-line/55 border-l-4 border-l-race-accent bg-race-surface p-5 sm:p-6">
          <SectionEyebrow>{content.eyebrow}</SectionEyebrow>
          <h2
            id="home-news-title"
            className="mt-3 font-display text-2xl font-bold leading-tight text-foreground dark:text-white sm:text-3xl"
          >
            {content.title}
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-race-muted sm:text-base sm:leading-7">
            {content.body}
          </p>
          <Link
            href={content.href}
            className="mt-4 inline-flex items-center gap-2 font-display text-sm font-semibold text-race-accent hover:text-race-accent-solid-hover"
          >
            {content.linkLabel}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </article>
      </div>
    </section>
  );
}
