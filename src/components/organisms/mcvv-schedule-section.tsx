import Image from "next/image";
import Link from "next/link";
import { CalendarDays, MapPin } from "lucide-react";

import { SectionHeader } from "@/components/molecules";
import { Button } from "@/components/ui/button";
import type { McvvHomepageContent } from "@/components/templates/mcvv-homepage-content";

export type McvvScheduleSectionProps = {
  content: McvvHomepageContent["schedule"];
};

export function McvvScheduleSection({ content }: McvvScheduleSectionProps) {
  return (
    <section id="date" className="bg-race-forest px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-stretch">
        <div>
          <SectionHeader eyebrow={content.eyebrow} title={content.title} />
          <div className="mt-6 grid gap-3">
            {content.items.map((item) => (
              <p
                key={item}
                className="flex items-center gap-3 text-base font-medium text-race-muted"
              >
                <CalendarDays className="size-5 text-race-accent" aria-hidden="true" />
                {item}
              </p>
            ))}
          </div>

          <div className="mt-8">
            <p className="font-display text-sm font-semibold uppercase text-race-muted">
              {content.countdownLabel}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {content.countdown.map((item) => (
                <div key={item.unit} className="border border-race-line/55 bg-race-surface p-4">
                  <p className="font-display text-3xl font-bold text-foreground dark:text-white">
                    {item.value}
                  </p>
                  <p className="mt-1 text-xs font-semibold uppercase text-race-dim">{item.unit}</p>
                </div>
              ))}
            </div>
          </div>

          <Button
            asChild
            size="lg"
            className="mt-8 h-12 bg-race-accent px-6 font-display text-base font-semibold text-white hover:bg-race-accent-hover"
          >
            <Link href="#register">{content.cta}</Link>
          </Button>
        </div>

        <div className="relative min-h-[340px] overflow-hidden border border-race-line/60 bg-race-deep lg:min-h-[560px]">
          <Image
            src="/mcvv/trail-map.jpg"
            alt=""
            fill
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="object-cover opacity-80"
          />
          <div className="absolute inset-0 bg-race-deep/25" />
          <div className="absolute left-1/2 top-1/2 flex size-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center bg-race-accent text-white">
            <MapPin className="size-6" aria-hidden="true" />
          </div>
          <div className="absolute inset-x-4 bottom-4 border border-white/10 bg-race-deep/90 p-5 backdrop-blur sm:left-6 sm:right-auto sm:w-[26rem]">
            <p className="font-display text-lg font-semibold text-white">{content.mapTitle}</p>
            <p className="mt-2 text-sm leading-6 text-race-muted">{content.mapAddress}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
