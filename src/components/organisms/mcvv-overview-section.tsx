import { Mountain, Route, ShieldCheck, Trees } from "lucide-react";

import { RaceInfoCard, SectionHeader } from "@/components/molecules";
import type { McvvHomepageContent } from "@/components/templates/mcvv-homepage-content";

const overviewIcons = [Mountain, Route, Trees];

export type McvvOverviewSectionProps = {
  content: McvvHomepageContent["overview"];
};

export function McvvOverviewSection({ content }: McvvOverviewSectionProps) {
  return (
    <section id="about" className="bg-race-forest px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
        <div>
          <SectionHeader
            eyebrow={content.eyebrow}
            title={content.title}
            titleClassName="max-w-xl"
          />
          <div className="mt-6 grid gap-4 text-base leading-7 text-race-muted">
            {content.body.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
          <div className="mt-8 flex items-center gap-4 border-l-2 border-race-accent pl-5">
            <p className="font-display text-4xl font-bold text-race-accent">
              {content.heritage.value}
            </p>
            <p className="max-w-52 text-sm leading-6 text-race-muted">{content.heritage.label}</p>
          </div>
        </div>

        <div className="grid gap-4">
          {content.cards.map((card, index) => (
            <RaceInfoCard
              key={card.title}
              icon={overviewIcons[index] ?? ShieldCheck}
              title={card.title}
              description={card.description}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
