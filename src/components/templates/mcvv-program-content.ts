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

/**
 * Blok Rozpisu jako v legacy `rozpis.php`: nadpis + odstavec. `body` smí obsahovat `\n`
 * (zalomení řádku) a odkazy `<tag>text</tag>` – viz `splitRozpisMarkup`.
 */
export type ProgramSectionCopy = {
  title: string;
  body: string;
};

export type McvvProgramContent = {
  brand: McvvHomepageContent["brand"];
  nav: McvvHomepageContent["nav"];
  header: {
    title: string;
  };
  tocTitle: string;
  emptyCategories: string;
  backToTop: string;
  sections: Record<ProgramSectionId, ProgramSectionCopy>;
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

export type ProgramCategoryRow = {
  id: string;
  name: string;
  birthYear: string;
};

export type McvvProgramView = {
  content: McvvProgramContent;
  categories: ProgramCategoryRow[];
  /** Web ročníku (`mcvv_info.infowww`) – cíl odkazu `<www>` v bloku Informace. */
  infoWww: string;
};
