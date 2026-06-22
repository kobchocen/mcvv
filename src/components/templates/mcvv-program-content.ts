import type { McvvHomepageContent } from "@/components/templates/mcvv-homepage-content";

export type ProgramIcon =
  | "calendar"
  | "map-pin"
  | "route"
  | "car"
  | "wallet"
  | "users"
  | "clipboard-list"
  | "coffee";

export type ProgramMeta = {
  label: string;
  icon: Extract<ProgramIcon, "calendar" | "map-pin" | "route">;
};

export type ProgramSection = {
  title: string;
  summary: string;
  body: string;
  icon: ProgramIcon;
};

export type McvvProgramContent = {
  brand: McvvHomepageContent["brand"];
  nav: McvvHomepageContent["nav"];
  header: {
    eyebrow: string;
    title: string;
    lead: string;
    meta: ProgramMeta[];
  };
  tocTitle: string;
  sections: ProgramSection[];
  cta: {
    title: string;
    description: string;
    button: string;
  };
};
