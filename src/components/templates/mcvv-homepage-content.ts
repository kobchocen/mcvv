import type { RaceWinner } from "@/components/molecules";

export type NavLink = {
  label: string;
  href: string;
};

export type StatItem = {
  value: string;
  label: string;
};

export type TextBlock = {
  title: string;
  description: string;
};

export type ScheduleItem = {
  label: string;
  value: string;
};

export type CountdownItem = {
  value: string;
  unit: string;
};

export type ResultItem = {
  year: string;
  label: string;
  winners: RaceWinner[];
  linkLabel: string;
};

export type McvvHomepageContent = {
  brand: {
    mark: string;
    top: string;
    bottom: string;
  };
  nav: {
    links: NavLink[];
    register: string;
    menuLabel: string;
  };
  hero: {
    kicker: string;
    place: string;
    titleLine1: string;
    titleLine2: string;
    claim: string;
    primaryCta: string;
    secondaryCta: string;
    tertiaryCta: string;
    stats: StatItem[];
  };
  overview: {
    eyebrow: string;
    title: string;
    body: string[];
    heritage: StatItem;
    cards: TextBlock[];
  };
  profile: {
    eyebrow: string;
    title: string;
    description: string;
    axis: string[];
    points: string[];
    stats: TextBlock[];
  };
  schedule: {
    eyebrow: string;
    title: string;
    items: string[];
    countdownLabel: string;
    countdown: CountdownItem[];
    cta: string;
    mapTitle: string;
    mapAddress: string;
  };
  info: {
    eyebrow: string;
    title: string;
    cards: TextBlock[];
    contactTitle: string;
    contactDescription: string;
    contactCta: string;
  };
  results: {
    eyebrow: string;
    title: string;
    allLabel: string;
    years: ResultItem[];
  };
  gallery: {
    eyebrow: string;
    title: string;
    description: string;
    alt: string[];
  };
  partners: {
    eyebrow: string;
    title: string;
    names: string[];
    organizer: string;
  };
  finalCta: {
    title: string;
    description: string;
    cta: string;
  };
  footer: {
    description: string;
    columns: {
      title: string;
      links: string[];
    }[];
    copyright: string;
    made: string;
  };
};
