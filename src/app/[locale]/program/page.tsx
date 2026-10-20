import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import {
  McvvProgramTemplate,
  type McvvHomepageContent,
  type McvvProgramContent,
  type ProgramCategoryRow,
} from "@/components/templates";
import { formatRaceDate } from "@/lib/format/date";
import { prisma } from "@/lib/db/client";
import { currentRaceYear, editionNumber } from "@/lib/entries/year";
import {
  categoryBirthYearBound,
  FALLBACK_ROZPIS_EDITION_ID,
  hasRozpisData,
} from "@/lib/race/program";
import { formatCzk } from "@/lib/utils";
import { type Locale } from "@/i18n/routing";

type ProgramPageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

const MAP_HREF =
  "https://www.openstreetmap.org/?mlat=49.99583&mlon=16.20278#map=16/49.99583/16.20278";

function formatBirthYear(
  age: number,
  rozpisYear: number,
  copy: McvvProgramContent["categories"],
): string {
  const bound = categoryBirthYearBound(age, rozpisYear);
  if (bound === null) {
    return copy.open;
  }
  const year = String(bound);
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
  const raceYear = await currentRaceYear();

  try {
    // The Rozpis follows the current edition; an edition without fees / prizes yet falls
    // back to the last known Rozpis (34. ročník) so the page never renders empty.
    [edition, categoryRows] = await Promise.all([
      raceYear.editionId
        ? prisma.edition.findUnique({ where: { id: raceYear.editionId } })
        : Promise.resolve(null),
      prisma.category.findMany({ orderBy: { sort: "asc" } }),
    ]);
    if (!hasRozpisData(edition)) {
      edition = await prisma.edition.findUnique({ where: { id: FALLBACK_ROZPIS_EDITION_ID } });
    }
  } catch {
    edition = null;
    categoryRows = [];
  }
  const editionId = edition?.id ?? editionNumber(raceYear);
  const rozpisYear = edition?.date ? edition.date.getUTCFullYear() : raceYear.year;

  const intervalSeconds = String(edition?.startInterval ?? 15);
  const rawSections = program.raw("sections") as McvvProgramContent["sections"];
  const sections: McvvProgramContent["sections"] = {
    ...rawSections,
    date: edition?.date
      ? { ...rawSections.date, summary: formatRaceDate(edition.date, locale) }
      : rawSections.date,
    start: {
      ...rawSections.start,
      body: program("sections.start.body", { seconds: intervalSeconds }),
    },
    categories: {
      ...rawSections.categories,
      summary: program("sections.categories.summary", { year: rozpisYear }),
    },
  };

  const content: McvvProgramContent = {
    brand: home.raw("brand") as McvvHomepageContent["brand"],
    nav: home.raw("nav") as McvvHomepageContent["nav"],
    header: {
      ...program.raw("header"),
      eyebrow: program("header.eyebrow", { year: rozpisYear }),
      lead: program("header.lead", { n: editionId }),
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
    birthYear: formatBirthYear(row.age, rozpisYear, content.categories),
  }));

  return (
    <McvvProgramTemplate
      content={content}
      editionId={editionId}
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
