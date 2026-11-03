import { paymentRegistrationId } from "@/lib/admin/parse";
import { prisma } from "@/lib/db/client";
import { currentRaceYear } from "@/lib/entries/year";
import { env } from "@/lib/env";
import { sendMail } from "@/lib/mail/queue";

import { slotOf } from "./core";
import { onsiteWindow } from "./defaults";
import { lateCancelMailDedupeKey, latePayMailDedupeKey } from "./late-core";
import {
  renderLateCancelMail,
  renderLatePayMail,
  type LateCancelMailInput,
  type LateMailInput,
} from "./late-mail-render";
import { hasMailAddress } from "./standard-pay-core";

/** Origin odkazů v e-mailech (jako připomínky a doplatek). */
export function mailSite(): string {
  return (env.AUTH_ORIGIN ?? "https://www.mcvv.org").replace(/\/$/, "");
}

/**
 * E-mail k (hned po odeslání pozdní přihlášky): „zaplaťte dnes do HH:MM“. Jde přes frontu
 * s prioritou potvrzení (denní limit, MAIL_ALLOWED_RECIPIENTS), klíč brání dvojímu odeslání.
 * Chyba e-mailu odeslání přihlášky neruší.
 */
export async function sendLatePayMail(year: number, id: number): Promise<void> {
  try {
    const [reg, meta, payments, race] = await Promise.all([
      prisma.registration.findUnique({
        where: { year_id: { year, id } },
        select: {
          email: true,
          lines: {
            select: { entryFee: true, runner: { select: { name: true } } },
            orderBy: { runnerId: "asc" },
          },
        },
      }),
      prisma.registrationMeta.findUnique({
        where: { year_id: { year, id } },
        select: { submittedAt: true, payUntil: true },
      }),
      prisma.payment.findMany({ where: { year }, select: { registrationId: true, amount: true } }),
      currentRaceYear(),
    ]);
    if (!reg || !meta?.submittedAt || !meta.payUntil || !hasMailAddress(reg.email)) return;
    const paid = payments
      .filter((payment) => paymentRegistrationId(payment.registrationId) === id)
      .reduce((sum, payment) => sum + (payment.amount ?? 0), 0);
    const lines = reg.lines.map((line) => ({ runner: line.runner.name, fee: line.entryFee ?? 0 }));
    const input: LateMailInput = {
      year,
      id,
      lines,
      fee: lines.reduce((sum, line) => sum + line.fee, 0),
      paid,
      site: mailSite(),
      submittedAt: meta.submittedAt,
      payUntil: meta.payUntil,
      raceDate: race.raceDate,
    };
    const mail = renderLatePayMail(input);
    await sendMail({
      ...mail,
      to: reg.email.trim().toLowerCase(),
      kind: "confirmation",
      dedupeKey: latePayMailDedupeKey(year, id),
    });
  } catch (error) {
    console.error("[late] pay mail failed", error);
  }
}

/** Nabídka v e-mailu l: běžící pozdní přihlášky a přihláška na místě (jen dosud neskončené). */
export async function lateCancelOffers(now: Date): Promise<{
  raceDate: Date | null;
  late: LateCancelMailInput["late"];
  onsite: LateCancelMailInput["onsite"];
}> {
  const race = await currentRaceYear();
  const late = slotOf(race.slots, "late");
  const onsiteSlot = slotOf(race.slots, "onsite");
  const hours =
    onsiteSlot ??
    (race.raceDate
      ? onsiteWindow(race.raceDate, race.slotSettings.officeOpensS, race.slotSettings.onsiteUntilS)
      : null);
  const lateRunning =
    late?.active && late.from.getTime() <= now.getTime() && now.getTime() < late.to.getTime();
  return {
    raceDate: race.raceDate,
    late: lateRunning && late ? { to: late.to } : null,
    onsite:
      hours && now.getTime() < hours.to.getTime()
        ? {
            from: hours.from,
            to: hours.to,
            feeAdult: onsiteSlot?.feeAdult ?? 200,
            feeYouth: onsiteSlot?.feeYouth ?? 100,
          }
        : null,
  };
}

/** E-mail l (po automatickém zrušení odeslané pozdní přihlášky). */
export async function sendLateCancelMail(email: string, input: LateCancelMailInput): Promise<void> {
  try {
    const mail = renderLateCancelMail(input);
    await sendMail({
      ...mail,
      to: email.trim().toLowerCase(),
      kind: "confirmation",
      dedupeKey: lateCancelMailDedupeKey(input.year, input.id),
    });
  } catch (error) {
    console.error("[late] cancel mail failed", error);
  }
}
