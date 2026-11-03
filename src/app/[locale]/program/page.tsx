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
import { formatRozpisDeadline } from "@/lib/race/rozpis-text";
import { fillPlaceholders, startTextParams } from "@/lib/race/start-text";
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

type CategoryCopy = { open: string; younger: string; older: string };

function formatBirthYear(age: number, rozpisYear: number, copy: CategoryCopy): string {
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
  const dash = program("dash");
  const czk = (value: number | null | undefined) => formatCzk(value, locale, dash);

  // Texty jsou v legacy znění (rozpis.php); hodnoty z ročníku a nastavení jako dřív.
  const startText = startTextParams(raceYear.startModel, raceYear.slotSettings);
  const infoWww = edition?.infoWww?.trim() || "www.mcvv.org";
  const zhl = edition?.zhl === true;
  const textParams: Record<string, string> = {
    ...startText,
    n: String(editionId),
    zhl: zhl ? (program.raw("introZhl") as string) : "",
    date: edition?.date ? formatRaceDate(edition.date, locale) : dash,
    deadlineDay: formatRozpisDeadline(edition?.regDeadline, locale, true) || dash,
    deadline: formatRozpisDeadline(edition?.regDeadline, locale, false) || dash,
    www: infoWww.replace(/^https?:\/\//, ""),
  };

  const fees = program.raw("fees") as Record<"online" | "onsite" | "zhl" | "freeEntry", string>;
  const feeLines = [
    fillPlaceholders(fees.online, {
      ...textParams,
      adult: czk(edition?.startAdultMail),
      kids: czk(edition?.startKidsMail),
    }),
    fillPlaceholders(fees.onsite, {
      adult: czk(edition?.startAdultPlace),
      kids: czk(edition?.startKidsPlace),
    }),
    ...(zhl ? [fillPlaceholders(fees.zhl, textParams)] : []),
    fillPlaceholders(fees.freeEntry, textParams),
  ];

  const prizes = program.raw("prizes") as Record<"money" | "material", string>;
  const prizeLines = [
    fillPlaceholders(prizes.money, {
      adult: [
        edition?.finAdult1,
        edition?.finAdult2,
        edition?.finAdult3,
        edition?.finAdult4,
        edition?.finAdult5,
      ]
        .map(czk)
        .join(", "),
      veterans: [edition?.finVet1, edition?.finVet2, edition?.finVet3].map(czk).join(", "),
    }),
    prizes.material,
  ];

  const rawSections = fillPlaceholders(
    program.raw("sections") as McvvProgramContent["sections"],
    textParams,
  );
  const sections: McvvProgramContent["sections"] = {
    ...rawSections,
    fees: { ...rawSections.fees, body: feeLines.join("\n") },
    prizes: { ...rawSections.prizes, body: prizeLines.join("\n") },
  };

  const content: McvvProgramContent = {
    brand: home.raw("brand") as McvvHomepageContent["brand"],
    nav: home.raw("nav") as McvvHomepageContent["nav"],
    header: { title: program("header.title") },
    tocTitle: program("tocTitle"),
    emptyCategories: program("emptyCategories"),
    backToTop: program("backToTop"),
    sections,
  };

  const categoryCopy = program.raw("categories") as CategoryCopy;
  const categories: ProgramCategoryRow[] = categoryRows.map((row) => ({
    id: row.id,
    name: row.name,
    birthYear: formatBirthYear(row.age, rozpisYear, categoryCopy),
  }));

  return <McvvProgramTemplate content={content} categories={categories} infoWww={infoWww} />;
}

export const dynamic = "force-dynamic";
