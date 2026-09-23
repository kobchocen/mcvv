import { Bus, CalendarDays, Car, Clock, MapPin, Train } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { RaceCountdown, RaceInfoCard, SectionHeader } from "@/components/molecules";
import type { McvvHomepageContent } from "@/components/templates/mcvv-homepage-content";

const itemIcons: Record<McvvHomepageContent["schedule"]["items"][number]["icon"], LucideIcon> = {
  calendar: CalendarDays,
  clock: Clock,
  pin: MapPin,
};

const travelIcons = [Car, Train, Bus];

export type McvvScheduleSectionProps = {
  content: McvvHomepageContent["schedule"];
};

export function McvvScheduleSection({ content }: McvvScheduleSectionProps) {
  return (
    <section id="date" className="bg-race-forest px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-start">
        <div>
          <SectionHeader eyebrow={content.eyebrow} title={content.title} />
          <div className="mt-6 grid gap-3">
            {content.items.map((item) => {
              const Icon = itemIcons[item.icon];
              return (
                <p
                  key={item.text}
                  className="flex items-center gap-3 text-base font-medium text-race-muted"
                >
                  <Icon className="size-5 shrink-0 text-race-accent" aria-hidden="true" />
                  <span>
                    {item.text}
                    {item.gpsLabel && item.gpsHref ? (
                      <>
                        {" "}
                        <a
                          href={item.gpsHref}
                          className="text-race-accent underline-offset-2 hover:underline"
                          target="_blank"
                          rel="noreferrer"
                        >
                          {item.gpsLabel}
                        </a>
                      </>
                    ) : null}
                  </span>
                </p>
              );
            })}
          </div>

          <RaceCountdown
            label={content.countdownLabel}
            units={content.countdownUnits}
            inProgressLabel={content.raceInProgress}
          />
        </div>

        <div className="grid gap-4">
          {content.travel.map((card, index) => (
            <RaceInfoCard
              key={card.title}
              icon={travelIcons[index] ?? MapPin}
              title={card.title}
              description={card.description}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
