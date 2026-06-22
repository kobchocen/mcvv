import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Trees } from "lucide-react";

import { RaceStatCard } from "@/components/molecules";
import { McvvNavbar } from "@/components/organisms/mcvv-navbar";
import { Button } from "@/components/ui/button";
import type { McvvHomepageContent } from "@/components/templates/mcvv-homepage-content";

export type McvvHeroSectionProps = {
  content: Pick<McvvHomepageContent, "brand" | "nav" | "hero">;
};

export function McvvHeroSection({ content }: McvvHeroSectionProps) {
  return (
    <section className="relative min-h-[760px] bg-race-forest text-white lg:min-h-[820px]">
      <Image src="/images/hero.jpg" alt="" fill priority sizes="100vw" className="object-cover" />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,oklch(0.16_0.035_150_/_0.95)_0%,oklch(0.16_0.035_150_/_0.38)_45%,oklch(0.16_0.035_150_/_0.9)_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,oklch(0.16_0.035_150_/_0.82)_0%,transparent_58%)]" />

      <McvvNavbar content={content} />

      <div className="relative mx-auto flex min-h-[760px] w-full max-w-7xl flex-col px-4 pt-32 pb-5 sm:px-6 lg:min-h-[820px] lg:px-8 lg:pt-[120px]">
        <div className="flex flex-1 items-center py-16">
          <div className="w-full max-w-3xl">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 bg-race-accent/15 px-3 py-2 font-display text-xs font-semibold uppercase text-race-accent">
                <Trees className="size-4" aria-hidden="true" />
                {content.hero.kicker}
              </span>
              <span className="text-sm font-medium text-race-muted">{content.hero.place}</span>
            </div>

            <h1 className="mt-6 font-display text-6xl font-bold leading-[0.95] text-white sm:text-7xl lg:text-8xl">
              <span className="block">{content.hero.titleLine1}</span>
              <span className="block text-race-accent">{content.hero.titleLine2}</span>
            </h1>
            <p className="mt-6 max-w-xl text-base leading-7 text-white/88 sm:text-xl sm:leading-8">
              {content.hero.claim}
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button
                asChild
                size="lg"
                className="h-12 bg-race-accent px-6 font-display text-base font-semibold text-white hover:bg-race-accent-hover"
              >
                <Link href="#register">
                  {content.hero.primaryCta}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-12 border-white/15 bg-white/10 px-6 font-display text-base font-semibold text-white hover:bg-white/15 hover:text-white"
              >
                <Link href="#info">{content.hero.secondaryCta}</Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="ghost"
                className="h-12 px-6 font-display text-base font-semibold text-white hover:bg-white/10 hover:text-white"
              >
                <Link href="#results">{content.hero.tertiaryCta}</Link>
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-3 border border-white/10 bg-race-deep/80 p-3 backdrop-blur sm:grid-cols-2 lg:grid-cols-4">
          {content.hero.stats.map((stat, index) => (
            <RaceStatCard key={stat.label} {...stat} accent={index > 1} />
          ))}
        </div>
      </div>
    </section>
  );
}
