import Link from "next/link";
import { ClipboardCheck, Coffee, Flag, Home, Mail, ShieldCheck, Trophy, Users } from "lucide-react";

import { RaceInfoCard, SectionHeader } from "@/components/molecules";
import { Button } from "@/components/ui/button";
import type { McvvHomepageContent } from "@/components/templates/mcvv-homepage-content";

const infoIcons = [ClipboardCheck, Flag, Users, Trophy, Coffee, Home];

export type McvvInfoSectionProps = {
  content: McvvHomepageContent["info"];
};

export function McvvInfoSection({ content }: McvvInfoSectionProps) {
  return (
    <section id="info" className="bg-race-deep px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <div className="mx-auto max-w-7xl">
        <SectionHeader eyebrow={content.eyebrow} title={content.title} className="max-w-3xl" />
        <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {content.cards.map((card, index) => (
            <RaceInfoCard
              key={card.title}
              icon={infoIcons[index] ?? ShieldCheck}
              title={card.title}
              description={card.description}
              className="bg-race-forest"
            />
          ))}
        </div>

        <div className="mt-8 grid gap-6 bg-race-accent p-6 text-white md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <h3 className="font-display text-2xl font-bold">{content.contactTitle}</h3>
            <p className="mt-2 text-sm leading-6 text-white/82">{content.contactDescription}</p>
          </div>
          <Button asChild className="h-12 bg-race-deep px-6 font-display font-semibold text-white">
            <Link href="mailto:info@velkaveranda.cz">
              <Mail className="size-4" aria-hidden="true" />
              {content.contactCta}
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
