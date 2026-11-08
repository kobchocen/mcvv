import type { McvvHomepageContent } from "@/components/templates/mcvv-homepage-content";

export const INSTRUCTION_SECTION_ORDER = [
  "organizer",
  "race",
  "date",
  "place",
  "parking",
  "distances",
  "office",
  "bib",
  "start",
  "course",
  "refreshments",
  "facilities",
  "medical",
  "awards",
  "timetable",
  "privacy",
  "notice",
  "spectators",
] as const;

export type InstructionSectionId = (typeof INSTRUCTION_SECTION_ORDER)[number];

export type InstructionSectionCopy = {
  title: string;
  paragraphs: string[];
  items: string[];
};

export type McvvInstructionsContent = {
  brand: McvvHomepageContent["brand"];
  nav: McvvHomepageContent["nav"];
  header: {
    eyebrow: string;
    title: string;
  };
  tocTitle: string;
  backToTop: string;
  mapAlt: string;
  sections: Record<InstructionSectionId, InstructionSectionCopy>;
};
