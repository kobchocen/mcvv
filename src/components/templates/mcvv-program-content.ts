import type { ReactNode } from "react";

import type { Locale } from "@/i18n/routing";

import type { McvvHomepageContent } from "@/components/templates/mcvv-homepage-content";

export type ProgramSectionId =
  | "intro"
  | "date"
  | "venue"
  | "organizer"
  | "course"
  | "registration"
  | "fees"
  | "categories"
  | "prizes"
  | "start"
  | "timetable"
  | "privacy"
  | "notice"
  | "info";

export type ProgramSectionCopy = {
  title: string;
  summary: string;
  body: string;
};

export type ProgramFeeCopy = {
  onlineAdult: string;
  onlineKids: string;
  onsiteAdult: string;
  onsiteKids: string;
  refund: string;
  freeEntry: string;
};

export type ProgramPrizeCopy = {
  adult: string;
  veterans: string;
  place: string;
  material: string;
};

export type ProgramCategoryCopy = {
  name: string;
  birthYear: string;
  open: string;
  younger: string;
  older: string;
};

export type ProgramTimetableCopy = {
  office: string;
  registration: string;
  start: string;
  lastStart: string;
  ceremony: string;
};

export type McvvProgramContent = {
  brand: McvvHomepageContent["brand"];
  nav: McvvHomepageContent["nav"];
  header: {
    eyebrow: string;
    title: string;
    lead: string;
  };
  tocTitle: string;
  emptyCategories: string;
  dash: string;
  gpsLabel: string;
  backToTop: string;
  onlineEntry: string;
  sections: Record<ProgramSectionId, ProgramSectionCopy>;
  fees: ProgramFeeCopy;
  prizes: ProgramPrizeCopy;
  categories: ProgramCategoryCopy;
  timetable: ProgramTimetableCopy;
};

export const PROGRAM_SECTION_ORDER: ProgramSectionId[] = [
  "intro",
  "date",
  "venue",
  "organizer",
  "course",
  "registration",
  "fees",
  "categories",
  "prizes",
  "start",
  "timetable",
  "privacy",
  "notice",
  "info",
];

export type ProgramFeeRow = {
  label: string;
  value: string;
};

export type ProgramCategoryRow = {
  id: string;
  name: string;
  birthYear: string;
};

export type McvvProgramView = {
  content: McvvProgramContent;
  /** Locale of the page; passed to every link so the en Rozpis links stay under /en. */
  locale: Locale;
  editionId: number;
  feeRows: ProgramFeeRow[];
  feeRefund: string;
  freeEntry: ReactNode;
  prizeAdult: string[];
  prizeVeterans: string[];
  categories: ProgramCategoryRow[];
  infoWww: string;
  contactHref: "/kontakt";
  contactLabel: string;
  mapHref: string;
};
