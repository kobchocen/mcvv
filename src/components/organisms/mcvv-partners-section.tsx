import Image from "next/image";

import { SectionHeader } from "@/components/molecules";
import type { McvvHomepageContent } from "@/components/templates/mcvv-homepage-content";
import { groupPartners, type PartnerGroupKey } from "@/lib/partners/groups";
import { VENKU_LOCALITY_HREF } from "@/lib/partners/venku";

import styles from "./mcvv-partners-section.module.css";

export type McvvPartnersSectionProps = {
  content: McvvHomepageContent["partners"];
};

function VenkuSlogan({
  line1,
  line2Prefix,
  logoAria,
}: {
  line1: string;
  line2Prefix: string;
  logoAria: string;
}) {
  return (
    <div className="mt-12 text-center">
      <p className="font-display text-2xl font-semibold leading-tight text-foreground dark:text-white sm:text-[28px]">
        {line1}
      </p>
      <p className="mt-3.5 font-display text-lg font-normal text-foreground dark:text-white sm:text-xl">
        <span>
          {line2Prefix}
          {"\u00a0"}
        </span>
        <a
          href={VENKU_LOCALITY_HREF}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={logoAria}
          className="inline-block align-baseline transition-opacity hover:opacity-80"
        >
          {/* Official wordmark is orange on both light and dark (brand mockup). */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/images/venku/venku-app-orange.svg"
            alt=""
            width={176}
            height={24}
            className={`${styles.wordmark} inline-block`}
          />
        </a>
      </p>
    </div>
  );
}

type PartnerItem = McvvHomepageContent["partners"]["items"][number];

type GroupLayout = { grid: string; tile: string; sizes: string };

/** Mockup 17. 11. 2026: main larger 3/row, partners as before 4/row, prizes smaller 6/row. */
const GROUP_LAYOUT: Record<PartnerGroupKey, GroupLayout> = {
  main: {
    grid: "grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3",
    tile: "h-28 px-3 py-3 sm:h-36 sm:px-6 sm:py-4 lg:h-40",
    sizes: "(min-width: 768px) 400px, 50vw",
  },
  partners: {
    grid: "grid grid-cols-3 gap-2 sm:gap-3 lg:grid-cols-4",
    tile: "h-20 px-2 py-2 sm:h-28 sm:px-4 sm:py-3",
    sizes: "(min-width: 1024px) 300px, 33vw",
  },
  prizes: {
    grid: "grid grid-cols-4 gap-1.5 sm:gap-2 md:grid-cols-6",
    tile: "h-14 p-1.5 sm:h-18 sm:px-3 sm:py-2",
    sizes: "(min-width: 768px) 200px, 25vw",
  },
};

function PartnerTile({ partner, layout }: { partner: PartnerItem; layout: GroupLayout }) {
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
          sizes={layout.sizes}
          className="h-full w-full object-contain"
        />
      ) : (
        <span className="font-display text-base font-bold text-race-dim">{partner.name}</span>
      )}
    </>
  );

  const className = `flex items-center justify-center border border-race-line/55 bg-white dark:bg-white/95 ${layout.tile}`;

  if (partner.href) {
    return (
      <a
        href={partner.href}
        target="_blank"
        rel="noopener noreferrer"
        className={`${className} transition hover:border-race-accent`}
      >
        {inner}
      </a>
    );
  }

  return <div className={className}>{inner}</div>;
}

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
        {groupPartners(content.items).map((group, index) => {
          const layout = GROUP_LAYOUT[group.key];
          return (
            <div
              key={group.key}
              className={index === 0 ? "mt-10" : "mt-12"}
              data-partner-group={group.key}
            >
              <h3 className="mb-5 font-display text-xl font-semibold leading-tight text-foreground dark:text-white sm:text-2xl">
                {content.groups[group.key]}
              </h3>
              <div className={layout.grid}>
                {group.items.map((partner) => (
                  <PartnerTile key={partner.name} partner={partner} layout={layout} />
                ))}
              </div>
            </div>
          );
        })}
        <VenkuSlogan
          line1={content.venkuLine1}
          line2Prefix={content.venkuLine2Prefix}
          logoAria={content.venkuLogoAria}
        />
        <p className="mt-9 text-sm font-medium text-race-muted">{content.organizer}</p>
      </div>
    </section>
  );
}
