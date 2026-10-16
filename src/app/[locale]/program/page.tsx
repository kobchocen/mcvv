import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import {
  McvvProgramTemplate,
  type McvvHomepageContent,
  type McvvProgramContent,
  type ProgramCategoryRow,
} from "@/components/templates";
import { prisma } from "@/lib/db/client";
import { formatCzk } from "@/lib/utils";
import { type Locale } from "@/i18n/routing";

type ProgramPageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

const ROZPIS_EDITION_ID = 34;
const ROZPIS_YEAR = 2026;
const MAP_HREF =
  "https://www.openstreetmap.org/?mlat=49.99583&mlon=16.20278#map=16/49.99583/16.20278";

function formatBirthYear(age: number, copy: McvvProgramContent["categories"]): string {
  if (age === 0) {
    return copy.open;
  }
  const year = String(ROZPIS_YEAR - age);
  if (age <= 20) {
    return copy.younger.replace("{year}", year);
  }
  return copy.older.replace("{year}", year);
}

function formatDeadline(date: Date | null | undefined, locale: Locale): string {
  if (!date) {
    return "";
  }
  return new Intl.DateTimeFormat(locale === "cs" ? "cs-CZ" : "en-GB", {
    day: "numeric",
    month: locale === "cs" ? "numeric" : "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export async function generateMetadata({ params }: ProgramPageProps): Promise<Metadata> {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  const t = await getTranslations({ locale, namespace: "Program" });
  return { title: t("header.title") };
}

export default async function ProgramPage({ params }: ProgramPageProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);

  const home = await getTranslations({ locale, namespace: "Home" });
  const program = await getTranslations({ locale, namespace: "Program" });

  let edition: Awaited<ReturnType<typeof prisma.edition.findUnique>> = null;
  let categoryRows: Awaited<ReturnType<typeof prisma.category.findMany>> = [];

  try {
    [edition, categoryRows] = await Promise.all([
      prisma.edition.findUnique({ where: { id: ROZPIS_EDITION_ID } }),
      prisma.category.findMany({ orderBy: { sort: "asc" } }),
    ]);
  } catch {
    edition = null;
    categoryRows = [];
  }

  const intervalSeconds = String(edition?.startInterval ?? 15);
  const rawSections = program.raw("sections") as McvvProgramContent["sections"];
  const sections: McvvProgramContent["sections"] = {
    ...rawSections,
    start: {
      ...rawSections.start,
      body: program("sections.start.body", { seconds: intervalSeconds }),
    },
  };

  const content: McvvProgramContent = {
    brand: home.raw("brand") as McvvHomepageContent["brand"],
    nav: home.raw("nav") as McvvHomepageContent["nav"],
    header: {
      ...program.raw("header"),
      lead: program("header.lead", { n: edition?.id ?? ROZPIS_EDITION_ID }),
    } as McvvProgramContent["header"],
    tocTitle: program("tocTitle"),
    emptyCategories: program("emptyCategories"),
    dash: program("dash"),
    gpsLabel: program("gpsLabel"),
    backToTop: program("backToTop"),
    onlineEntry: program("onlineEntry"),
    sections,
    fees: program.raw("fees") as McvvProgramContent["fees"],
    prizes: program.raw("prizes") as McvvProgramContent["prizes"],
    categories: program.raw("categories") as McvvProgramContent["categories"],
    timetable: program.raw("timetable") as McvvProgramContent["timetable"],
  };

  const dash = content.dash;
  const deadline = formatDeadline(edition?.regDeadline, locale);
  const feeRefund = deadline
    ? program("fees.refund", { date: deadline })
    : program("fees.refundOpen");

  const categories: ProgramCategoryRow[] = categoryRows.map((row) => ({
    id: row.id,
    name: row.name,
    birthYear: formatBirthYear(row.age, content.categories),
  }));

  return (
    <McvvProgramTemplate
      content={content}
      editionId={edition?.id ?? ROZPIS_EDITION_ID}
      feeRows={[
        {
          label: content.fees.onlineAdult,
          value: formatCzk(edition?.startAdultMail, locale, dash),
        },
        {
          label: content.fees.onlineKids,
          value: formatCzk(edition?.startKidsMail, locale, dash),
        },
        {
          label: content.fees.onsiteAdult,
          value: formatCzk(edition?.startAdultPlace, locale, dash),
        },
        {
          label: content.fees.onsiteKids,
          value: formatCzk(edition?.startKidsPlace, locale, dash),
        },
      ]}
      feeRefund={feeRefund}
      prizeAdult={[
        formatCzk(edition?.finAdult1, locale, dash),
        formatCzk(edition?.finAdult2, locale, dash),
        formatCzk(edition?.finAdult3, locale, dash),
        formatCzk(edition?.finAdult4, locale, dash),
        formatCzk(edition?.finAdult5, locale, dash),
      ]}
      prizeVeterans={[
        formatCzk(edition?.finVet1, locale, dash),
        formatCzk(edition?.finVet2, locale, dash),
        formatCzk(edition?.finVet3, locale, dash),
      ]}
      categories={categories}
      infoWww={edition?.infoWww?.trim() || "www.mcvv.org"}
      contactHref="/kontakt"
      contactLabel={program("contactLabel")}
      mapHref={MAP_HREF}
    />
  );
}

export const dynamic = "force-dynamic";
