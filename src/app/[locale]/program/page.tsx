import type { Metadata } from "next";
import type { ReactNode } from "react";
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
import { fillPlaceholders, startTextParams } from "@/lib/race/start-text";
import {
  categoryBirthYearBound,
  FALLBACK_ROZPIS_EDITION_ID,
  FREE_ENTRY_LINKS,
  formatFreeEntryDeadline,
  formatOnlineDeadline,
  formatRaceDayShort,
  hasRozpisData,
} from "@/lib/race/program";
import { formatCzk } from "@/lib/utils";
import { Link, type Locale } from "@/i18n/routing";
import { intlTag } from "@/lib/i18n/locale";

type ProgramPageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

const FREE_ENTRY_LINK_CLASS = "font-medium text-race-accent underline-offset-2 hover:underline";
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
  return new Intl.DateTimeFormat(intlTag(locale), {
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

  // Čas startu a interval podle modelu aktuálního ročníku (st_nula_s, st_interval).
  const startText = startTextParams(raceYear.startModel, raceYear.slotSettings);
  const rawSections = fillPlaceholders(
    program.raw("sections") as McvvProgramContent["sections"],
    startText,
  );
  // Q414 / Q416: online deadline (end of standard entries), race day and on-site fees from the
  // edition settings; without a deadline or race date the section keeps the general wording.
  const onlineUntil = formatOnlineDeadline(raceYear.standardEnd, locale);
  const raceDay = formatRaceDayShort(edition?.date, locale);
  const registrationParams = {
    officeOpens: startText.officeOpens,
    onsiteUntil: startText.onsiteUntil,
    feeAdult: formatCzk(edition?.startAdultPlace, locale, program("dash")),
    feeYouth: formatCzk(edition?.startKidsPlace, locale, program("dash")),
  };
  const sections: McvvProgramContent["sections"] = {
    ...rawSections,
    registration: {
      ...rawSections.registration,
      ...(onlineUntil && raceDay
        ? {
            summary: program("sections.registration.summary", {
              onlineUntilShort: onlineUntil.short,
              onsiteUntil: startText.onsiteUntil,
            }),
            body: program("sections.registration.body", {
              ...registrationParams,
              onlineUntil: onlineUntil.long,
              raceDay,
            }),
          }
        : {
            summary: program("sections.registration.summaryOpen", {
              onsiteUntil: startText.onsiteUntil,
            }),
            body: program("sections.registration.bodyOpen", registrationParams),
          }),
    },
    date: edition?.date
      ? { ...rawSections.date, summary: formatRaceDate(edition.date, locale) }
      : rawSections.date,
    start: {
      ...rawSections.start,
      body: program("sections.start.body", {
        seconds: startText.interval,
        startTime: startText.startTime,
      }),
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
    timetable: fillPlaceholders(
      program.raw("timetable") as McvvProgramContent["timetable"],
      startText,
    ),
  };

  const dash = content.dash;
  const deadline = formatDeadline(edition?.regDeadline, locale);
  const feeRefund = deadline
    ? program("fees.refund", { date: deadline })
    : program("fees.refundOpen");
  // Q417: links to the statistics lists; the date is the end of online (standard) entries.
  const freeEntryDate = formatFreeEntryDeadline(edition?.regDeadline, locale);
  const freeEntryLinks = {
    winners: (chunks: ReactNode) => (
      <Link
        href={{ pathname: "/statistiky/[slug]", params: { slug: FREE_ENTRY_LINKS.winners } }}
        locale={locale}
        className={FREE_ENTRY_LINK_CLASS}
      >
        {chunks}
      </Link>
    ),
    veterans: (chunks: ReactNode) => (
      <Link
        href={{ pathname: "/statistiky/[slug]", params: { slug: FREE_ENTRY_LINKS.veterans } }}
        locale={locale}
        className={FREE_ENTRY_LINK_CLASS}
      >
        {chunks}
      </Link>
    ),
  };
  const freeEntry = freeEntryDate
    ? program.rich("fees.freeEntry", { ...freeEntryLinks, date: freeEntryDate })
    : program.rich("fees.freeEntryOpen", freeEntryLinks);

  const categories: ProgramCategoryRow[] = categoryRows.map((row) => ({
    id: row.id,
    name: row.name,
    birthYear: formatBirthYear(row.age, rozpisYear, content.categories),
  }));

  return (
    <McvvProgramTemplate
      content={content}
      locale={locale}
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
      freeEntry={freeEntry}
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
