/**
 * Zaplacená pozdní přihláška (NAVRH 2.3/5, část 7): po potvrzení přihlášky
 * 1. startovka zveřejněná → číslo a čas startu (Q326, `late-bib-core`), řádek zamčený,
 * 2. e-mail g „Platba přijata – jste přihlášeni“ s čísly a časy (mockup dohlaska.html?s=g).
 * Po pozdější změně čísla se e-mail neposílá (Q327).
 */
import { paymentRegistrationId } from "@/lib/admin/parse";
import { startLineTarget } from "@/lib/audit/startlist";
import { prisma } from "@/lib/db/client";
import { currentRaceYear } from "@/lib/entries/year";
import { env } from "@/lib/env";
import { sendMail } from "@/lib/mail/queue";
import { loadStartSettings } from "@/lib/race/startlist-load";
import { getSiteSettings } from "@/lib/settings/site";

import { onsiteWindow } from "./defaults";
import { latePaidMailDedupeKey, latePaidStartFacts, pickLateBibs } from "./late-bib-core";
import { mailSite } from "./late-mail";
import { renderLatePaidMail } from "./late-mail-render";
import { hasMailAddress } from "./standard-pay-core";

const SYSTEM_ACTOR = { actorUserId: null, actorEmail: "system@mcvv", actorRole: "system" } as const;
const BIB_LOCK = "mcvv_late_bib";

export type LateBibResult = {
  published: boolean;
  assigned: { runnerId: string; bib: number; outsideCategory: boolean }[];
  /** Běžci bez volného čísla (přidělí pořadatel ručně). */
  missing: string[];
};

/** Je přihláška pozdní a odeslaná? */
export async function isSubmittedLate(year: number, id: number): Promise<boolean> {
  const meta = await prisma.registrationMeta.findUnique({
    where: { year_id: { year, id } },
    select: { slot: true, submittedAt: true },
  });
  return meta?.slot === "late" && meta.submittedAt != null;
}

/**
 * Přidělí čísla běžcům zaplacené pozdní přihlášky, jen když je startovka zveřejněná.
 * Pod zámkem databáze (GET_LOCK), aby dvě současné platby nedostaly stejné číslo.
 */
export async function assignLateBibs(year: number, id: number): Promise<LateBibResult> {
  const site = await getSiteSettings();
  if (!site.startlistPublished) return { published: false, assigned: [], missing: [] };
  const settings = await loadStartSettings(year);
  const result = await prisma.$transaction(
    async (tx) => {
      const lock = await tx.$queryRaw<{ ok: bigint | number | null }[]>`
        SELECT GET_LOCK(${BIB_LOCK}, 10) AS ok`;
      if (Number(lock[0]?.ok ?? 0) !== 1) throw new Error("late bib lock timeout");
      try {
        const [own, lines, imported] = await Promise.all([
          tx.registrationLine.findMany({
            where: { year, registrationId: id },
            select: { runnerId: true, categoryId: true, bib: true },
            orderBy: { runnerId: "asc" },
          }),
          tx.registrationLine.findMany({
            where: { year, bib: { gt: 0 } },
            select: { bib: true },
          }),
          tx.startEntry.findMany({ where: { year, bib: { gt: 0 } }, select: { bib: true } }),
        ]);
        const taken = new Set<number>([
          ...lines.map((line) => line.bib!),
          ...imported.map((row) => row.bib),
          ...[settings.champions.men, settings.champions.women].filter(
            (bib): bib is number => bib != null && bib > 0,
          ),
        ]);
        const picks = pickLateBibs(own, settings.ranges, taken);
        const assigned: LateBibResult["assigned"] = [];
        const missing: string[] = [];
        for (const { runnerId, pick } of picks) {
          if (!pick) {
            missing.push(runnerId);
            continue;
          }
          await tx.registrationLine.update({
            where: { year_runnerId: { year, runnerId } },
            data: { bib: pick.bib },
          });
          await tx.startLineMeta.upsert({
            where: { year_runnerId: { year, runnerId } },
            update: { locked: true },
            create: { year, runnerId, locked: true },
          });
          await tx.auditLog.create({
            data: {
              ...SYSTEM_ACTOR,
              action: "startlist.bib_set",
              target: startLineTarget(year, runnerId),
              detail: {
                changes: { bib: { from: null, to: pick.bib }, locked: { from: false, to: true } },
                auto: "late_paid",
                registrationId: id,
                outsideCategory: pick.outsideCategory,
              },
            },
          });
          assigned.push({ runnerId, ...pick });
        }
        return { published: true, assigned, missing };
      } finally {
        await tx.$queryRaw`SELECT RELEASE_LOCK(${BIB_LOCK})`;
      }
    },
    { timeout: 20_000 },
  );
  if (result.missing.length > 0) {
    await sendMail({
      kind: "alert",
      to: env.ALERT_TO,
      dedupeKey: `alert:late-bib:${year}:${id}`,
      subject: `MCVV: pozdní přihláška ${year}/${id} bez startovního čísla`,
      text: `Zaplacená pozdní přihláška ${year}/${id}: pro ${result.missing.length} běžce není volné číslo. Přidělte ho ručně ve startovce.\n\n${mailSite()}/cs/admin/startovka`,
      html: `<p>Zaplacená pozdní přihláška ${year}/${id}: pro ${result.missing.length} běžce není volné číslo. Přidělte ho ručně ve startovce.</p><p><a href="${mailSite()}/cs/admin/startovka">Startovka</a></p>`,
    }).catch((error) => console.error("[late] bib alert failed", error));
  }
  return result;
}

/** E-mail g po zaplacení pozdní přihlášky (fronta s prioritou potvrzení, jednou na přihlášku). */
export async function sendLatePaidMail(
  year: number,
  id: number,
  options: { published: boolean; site?: string },
): Promise<boolean> {
  try {
    const [reg, payments, race, settings] = await Promise.all([
      prisma.registration.findUnique({
        where: { year_id: { year, id } },
        select: {
          email: true,
          lines: {
            select: {
              bib: true,
              entryFee: true,
              runner: { select: { name: true } },
              category: { select: { name: true } },
            },
            orderBy: { runnerId: "asc" },
          },
        },
      }),
      prisma.payment.findMany({ where: { year }, select: { registrationId: true, amount: true } }),
      currentRaceYear(),
      loadStartSettings(year),
    ]);
    if (!reg || !hasMailAddress(reg.email)) return false;
    const paid = payments
      .filter((payment) => paymentRegistrationId(payment.registrationId) === id)
      .reduce((sum, payment) => sum + (payment.amount ?? 0), 0);
    const facts = latePaidStartFacts(settings.model, reg.lines, options.published);
    const lines = facts.lines;
    const office = race.raceDate
      ? onsiteWindow(race.raceDate, race.slotSettings.officeOpensS, race.slotSettings.onsiteUntilS)
      : null;
    const mail = renderLatePaidMail({
      year,
      id,
      lines,
      fee: lines.reduce((sum, line) => sum + line.fee, 0),
      paid,
      site: (options.site ?? mailSite()).replace(/\/$/, ""),
      raceDate: race.raceDate,
      published: options.published,
      officeOpens: office?.from ?? null,
      firstStart: facts.firstStart,
    });
    const outcome = await sendMail({
      ...mail,
      to: reg.email.trim().toLowerCase(),
      kind: "confirmation",
      dedupeKey: latePaidMailDedupeKey(year, id),
    });
    return outcome !== "failed";
  } catch (error) {
    console.error("[late] paid mail failed", error);
    return false;
  }
}

/** Po potvrzení zaplacené pozdní přihlášky: čísla (po zveřejnění startovky) a e-mail g. */
export async function onLatePaidConfirmed(
  year: number,
  id: number,
  options: { site?: string } = {},
): Promise<boolean> {
  let published = false;
  try {
    published = (await assignLateBibs(year, id)).published;
  } catch (error) {
    console.error("[late] bib assignment failed", error);
    published = (await getSiteSettings()).startlistPublished;
  }
  return sendLatePaidMail(year, id, { published, site: options.site });
}
