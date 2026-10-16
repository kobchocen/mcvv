import { prisma } from "@/lib/db/client";
import { paymentRegistrationId } from "@/lib/admin/parse";
import { getFreeEntryEmails } from "@/lib/entries/settings";

export type FeeReason = "organizer" | "winner" | "veteran";

function runnerSex(id: string): "M" | "F" {
  return id.charAt(4) < "5" ? "M" : "F";
}

async function absoluteWinnerIds(): Promise<Set<string>> {
  const rows = await prisma.result.findMany({
    select: { year: true, runnerId: true, time: true },
  });
  const best = new Map<string, { id: string; time: number }>();
  for (const row of rows) {
    const key = `${row.year}-${runnerSex(row.runnerId)}`;
    const current = best.get(key);
    if (!current || row.time < current.time) {
      best.set(key, { id: row.runnerId, time: row.time });
    }
  }
  return new Set([...best.values()].map((row) => row.id));
}

async function veteranIds(): Promise<Set<string>> {
  const rows = await prisma.result.findMany({ select: { year: true, runnerId: true } });
  const yearCount = new Set(rows.map((row) => row.year)).size;
  const pocr = Math.round(yearCount / 2 + 0.5) - 1;
  const starts = new Map<string, number>();
  for (const row of rows) {
    starts.set(row.runnerId, (starts.get(row.runnerId) ?? 0) + 1);
  }
  const ids = new Set<string>();
  for (const [id, count] of starts) {
    if (count > pocr) {
      ids.add(id);
    }
  }
  return ids;
}

export async function computeLineFee(
  email: string,
  runnerId: string,
  categoryFee: number,
): Promise<{ fee: number; reason: FeeReason | null }> {
  const freeEmails = await getFreeEntryEmails();
  if (freeEmails.has(email.trim().toLowerCase())) {
    return { fee: 0, reason: "organizer" };
  }
  const winners = await absoluteWinnerIds();
  if (winners.has(runnerId)) {
    return { fee: 0, reason: "winner" };
  }
  const veterans = await veteranIds();
  if (veterans.has(runnerId)) {
    return { fee: 0, reason: "veteran" };
  }
  return { fee: categoryFee, reason: null };
}

export async function paidAmount(year: number, registrationId: number): Promise<number> {
  const payments = await prisma.payment.findMany({
    where: { year },
    select: { registrationId: true, amount: true },
  });
  return payments
    .filter((payment) => paymentRegistrationId(payment.registrationId) === registrationId)
    .reduce((sum, payment) => sum + (payment.amount ?? 0), 0);
}
