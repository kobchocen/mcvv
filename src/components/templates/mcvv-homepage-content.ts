import type { RaceWinner } from "@/components/molecules";

export type NavLink = {
  label: string;
  href: string;
};

export type OverviewAction = NavLink;

export type StatItem = {
  value: string;
  label: string;
};

export type TextBlock = {
  title: string;
  description: string;
};

export type ArrivalMapContent = {
  /** Popisek odkazu pod špendlíkem místa konání. */
  linkLabel: string;
  /** Název modálního okna (pro čtečky). */
  title: string;
  mapAlt: string;
  attribution: string;
  closeLabel: string;
  /** Popisek města v mapě (vlastní jméno). */
  townLabel: string;
  /** Popisek nad bodem startu/cíle (vlastní jméno). */
  verandaLabel: string;
  /** Krátké značky bodů v mapě (S/C, P1, P2, Vlak, Bus). */
  labels: Record<"veranda" | "p1" | "p2" | "train" | "bus", string>;
};

export type ScheduleItem = {
  text: string;
  icon: "calendar" | "clock" | "pin";
  gpsLabel?: string;
  gpsHref?: string;
};

export type CountdownUnits = {
  days: string;
  hours: string;
  minutes: string;
  seconds: string;
};

export type ResultItem = {
  year: string;
  label: string;
  winners: RaceWinner[];
  linkLabel: string;
  href?: string;
  count?: number;
};

export function withFooterYear(
  footer: McvvHomepageContent["footer"],
  year: number | null,
): McvvHomepageContent["footer"] {
  return {
    ...footer,
    columns: footer.columns.map((column) => ({
      ...column,
      links: column.links
        .map((link) => {
          if (!link.href?.includes("{year}")) {
            return link;
          }
          if (!year) {
            return null;
          }
          return { ...link, href: link.href.replace("{year}", String(year)) };
        })
        .filter((link): link is NonNullable<typeof link> => link !== null),
    })),
  };
}

export type McvvHomepageContent = {
  brand: {
    mark: string;
    top: string;
    bottom: string;
  };
  nav: {
    home: NavLink;
    links: NavLink[];
    register: string;
    myEntry: string;
    admin: string;
    logout: string;
    loggingOut: string;
    menuLabel: string;
    closeLabel: string;
  };
  hero: {
    kicker: string;
    place: string;
    titleLine1: string;
    titleLine2: string;
    memorial?: string;
    claim: string;
    primaryCta: string;
    primaryHref: string;
    secondaryCta: string;
    secondaryHref: string;
    tertiaryCta: string;
    tertiaryHref: string;
    /** ICU: aria-label tlačítka Přihlášky s počtem přihlášených ({cta}, {count}). */
    enrolledAria: string;
    stats: StatItem[];
  };
  overview: {
    eyebrow: string;
    title: string;
    body: string[];
    cards: TextBlock[];
    facts: TextBlock[];
    actions: OverviewAction[];
  };
  profile: {
    eyebrow: string;
    title: string;
    description: string;
    axis: string[];
    points: string[];
    stats: TextBlock[];
    mapKicker: string;
    mapTitle: string;
    mapAddress: string;
    mapAlt: string;
    mapExpandLabel: string;
  };
  schedule: {
    eyebrow: string;
    title: string;
    items: ScheduleItem[];
    countdownLabel: string;
    countdownUnits: CountdownUnits;
    raceInProgress: string;
    travel: TextBlock[];
    arrivalMap?: ArrivalMapContent;
  };
  results: {
    eyebrow: string;
    title: string;
    allLabel: string;
    yearLabel: string;
    linkLabel: string;
    empty: string;
    searchPlaceholder: string;
    searchEmpty: string;
    stats: { slug: string; title: string; description: string; linkLabel: string }[];
    years: ResultItem[];
  };
  gallery: {
    eyebrow: string;
    title: string;
    description: string;
    alt: string[];
    allLabel: string;
  };
  partners: {
    eyebrow: string;
    title: string;
    organizer: string;
    items: {
      name: string;
      href: string | null;
      logoSrc: string | null;
      /** SVG or DB-served logo: render with a plain <img>, not the image optimizer. */
      logoPlain?: boolean;
    }[];
  };
  finalCta: {
    title: string;
    description: string;
    cta: string;
    guide?: string;
  };
  footer: {
    description: string;
    columns: {
      title: string;
      links: { label: string; href?: string }[];
    }[];
    copyright: string;
    made: string;
  };
  backToTop: string;
};
