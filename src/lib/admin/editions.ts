"use server";

import { revalidatePath } from "next/cache";
import { getLocale } from "next-intl/server";

import { requireStaff } from "@/lib/admin/staff";
import { formDate, formInt, formString } from "@/lib/admin/parse";
import { prisma } from "@/lib/db/client";
import { ensureOrganizerRegistration } from "@/lib/entries/organizer-registration";
import { loadBibRanges } from "@/lib/race/startlist-load";
import { encodeStartIssues, validateStartSettings, type BibRange } from "@/lib/race/start-settings";
import { DEFAULT_START_MODEL, parseClock } from "@/lib/race/start-time";
import { redirect } from "@/i18n/routing";

function revalidateEditions() {
  revalidatePath("/[locale]/admin", "layout");
  revalidatePath("/[locale]/admin/rocniky", "page");
  revalidatePath("/[locale]/admin/startovka", "page");
  revalidatePath("/[locale]/startovka", "page");
}

function feeFields(data: FormData) {
  return {
    startKidsMail: formInt(data, "startKidsMail"),
    startKidsPlace: formInt(data, "startKidsPlace"),
    startAdultMail: formInt(data, "startAdultMail"),
    startAdultPlace: formInt(data, "startAdultPlace"),
    startInterval: formInt(data, "startInterval"),
    finAdult1: formInt(data, "finAdult1"),
    finAdult2: formInt(data, "finAdult2"),
    finAdult3: formInt(data, "finAdult3"),
    finAdult4: formInt(data, "finAdult4"),
    finAdult5: formInt(data, "finAdult5"),
    finVet1: formInt(data, "finVet1"),
    finVet2: formInt(data, "finVet2"),
    finVet3: formInt(data, "finVet3"),
  };
}

/** Rozsahy čísel z formuláře (`range_<kat>_from`, `range_<kat>_to`); null = formulář je neobsahuje. */
function formRanges(data: FormData, categoryIds: string[]): BibRange[] | null {
  if (!categoryIds.some((id) => data.has(`range_${id}_from`))) {
    return null;
  }
  return categoryIds.map((categoryId) => ({
    categoryId,
    bibFrom: formInt(data, `range_${categoryId}_from`) ?? 0,
    bibTo: formInt(data, `range_${categoryId}_to`) ?? 0,
  }));
}

/** Rozsahy pro nový ročník: kopie z nejbližšího předchozího roku, jinak číselník kategorií. */
async function copyRangesForNewYear(year: number): Promise<void> {
  const exists = await prisma.categoryBibRange.count({ where: { year } });
  if (exists > 0) {
    return;
  }
  const previous = await prisma.categoryBibRange.findFirst({
    where: { year: { lt: year } },
    orderBy: { year: "desc" },
    select: { year: true },
  });
  const source = await loadBibRanges(previous?.year ?? year);
  await prisma.categoryBibRange.createMany({
    data: source.ranges.map((range) => ({ year, ...range })),
    skipDuplicates: true,
  });
}

export async function saveEdition(formData: FormData): Promise<void> {
  const actor = await requireStaff();
  const locale = await getLocale();
  const id = formInt(formData, "id");
  const date = formDate(formData, "date");
  if (!date) {
    return;
  }
  const year = date.getUTCFullYear();
  const zeroRaw = formString(formData, "startZero");
  const zeroSeconds = zeroRaw ? parseClock(zeroRaw) : DEFAULT_START_MODEL.zeroSeconds;
  const intervalSeconds = formInt(formData, "startInterval") ?? DEFAULT_START_MODEL.intervalSeconds;
  const secondStartFrom =
    formInt(formData, "secondStartFrom") ?? DEFAULT_START_MODEL.secondStartFrom;
  const champions = {
    men: formInt(formData, "championBibMen"),
    women: formInt(formData, "championBibWomen"),
  };
  const { categories, ranges: currentRanges } = await loadBibRanges(year);
  const ranges = formRanges(
    formData,
    categories.map((category) => category.id),
  );
  const issues = validateStartSettings(
    { zeroSeconds: zeroSeconds ?? -1, intervalSeconds, secondStartFrom },
    ranges ?? currentRanges,
    champions,
  );
  if (issues.length > 0) {
    redirect({
      href: id
        ? {
            pathname: "/admin/rocniky/[id]",
            params: { id: String(id) },
            query: { chyba: encodeStartIssues(issues) },
          }
        : { pathname: "/admin/rocniky/novy", query: { chyba: encodeStartIssues(issues) } },
      locale,
    });
  }
  const payload = {
    date,
    regDeadline: formDate(formData, "regDeadline"),
    weather: formString(formData, "weather") || null,
    temp: formInt(formData, "temp"),
    ...feeFields(formData),
    startZeroSeconds: zeroSeconds ?? DEFAULT_START_MODEL.zeroSeconds,
    secondStartFrom,
    championBibMen: champions.men,
    championBibWomen: champions.women,
  };

  if (id) {
    await prisma.edition.update({ where: { id }, data: payload });
  } else {
    await prisma.edition.create({ data: payload });
  }
  if (ranges) {
    await prisma.$transaction(
      ranges.map((range) =>
        prisma.categoryBibRange.upsert({
          where: { year_categoryId: { year, categoryId: range.categoryId } },
          update: { bibFrom: range.bibFrom, bibTo: range.bibTo },
          create: { year, ...range },
        }),
      ),
    );
  } else {
    await copyRangesForNewYear(year);
  }
  // Přihláška pořadatelů (č. 1) vzniká s ročníkem, ne náhodou při první návštěvě /prihlasky.
  await ensureOrganizerRegistration(year, actor.email);

  revalidateEditions();
  redirect({ href: "/admin/rocniky", locale });
}
