import { SectionHeader } from "@/components/molecules";
import type { McvvHomepageContent } from "@/components/templates/mcvv-homepage-content";

export type McvvPartnersSectionProps = {
  content: McvvHomepageContent["partners"];
};

export function McvvPartnersSection({ content }: McvvPartnersSectionProps) {
  return (
    <section id="partners" className="bg-race-forest px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <div className="mx-auto max-w-7xl text-center">
        <SectionHeader
          eyebrow={content.eyebrow}
          title={content.title}
          align="center"
          titleClassName="mx-auto max-w-3xl text-3xl sm:text-4xl"
        />
        <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          {content.names.map((name) => (
            <div
              key={name}
              className="flex h-20 items-center justify-center border border-race-line/55 bg-race-surface px-4 font-display text-lg font-bold text-race-dim"
            >
              {name}
            </div>
          ))}
        </div>
        <p className="mt-8 text-sm font-medium text-race-muted">{content.organizer}</p>
      </div>
    </section>
  );
}
