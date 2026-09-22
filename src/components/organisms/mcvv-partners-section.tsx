import Image from "next/image";

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
        <div className="mt-10 grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {content.items.map((partner) => {
            const inner = (
              <>
                {partner.logoSrc ? (
                  <Image
                    src={partner.logoSrc}
                    alt={partner.name}
                    width={180}
                    height={64}
                    className="max-h-16 w-auto object-contain"
                  />
                ) : (
                  <span className="font-display text-base font-bold text-race-dim">
                    {partner.name}
                  </span>
                )}
              </>
            );

            const className =
              "flex h-24 items-center justify-center border border-race-line/55 bg-white px-4 dark:bg-white/95";

            if (partner.href) {
              return (
                <a
                  key={partner.name}
                  href={partner.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${className} transition hover:border-race-accent`}
                >
                  {inner}
                </a>
              );
            }

            return (
              <div key={partner.name} className={className}>
                {inner}
              </div>
            );
          })}
        </div>
        <p className="mt-8 text-sm font-medium text-race-muted">{content.organizer}</p>
      </div>
    </section>
  );
}
