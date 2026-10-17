import Image from "next/image";

import { SectionHeader } from "@/components/molecules";
import type { McvvHomepageContent } from "@/components/templates/mcvv-homepage-content";

export type McvvPartnersSectionProps = {
  content: McvvHomepageContent["partners"];
};

export function McvvPartnersSection({ content }: McvvPartnersSectionProps) {
  return (
    <section id="partners" className="bg-race-deep px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
      <div className="mx-auto max-w-7xl text-center">
        <SectionHeader
          eyebrow={content.eyebrow}
          title={content.title}
          align="center"
          titleClassName="mx-auto max-w-3xl text-3xl sm:text-4xl"
        />
        <div className="mt-10 grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-3 lg:grid-cols-4">
          {content.items.map((partner) => {
            const inner = (
              <>
                {partner.logoSrc && partner.logoPlain ? (
                  // SVG / uploaded logos: plain <img> (never inlined, no optimizer).
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={partner.logoSrc}
                    alt={partner.name}
                    width={240}
                    height={65}
                    loading="lazy"
                    decoding="async"
                    className="h-full w-full object-contain"
                  />
                ) : partner.logoSrc ? (
                  <Image
                    src={partner.logoSrc}
                    alt={partner.name}
                    width={240}
                    height={65}
                    sizes="(min-width: 1024px) 300px, (min-width: 768px) 33vw, 50vw"
                    className="h-full w-full object-contain"
                  />
                ) : (
                  <span className="font-display text-base font-bold text-race-dim">
                    {partner.name}
                  </span>
                )}
              </>
            );

            const className =
              "flex h-20 items-center justify-center border border-race-line/55 bg-white px-2 py-2 sm:h-28 sm:px-4 sm:py-3 dark:bg-white/95";

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
