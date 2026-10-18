import { prisma } from "@/lib/db/client";
import { sendConfirmationEmail } from "@/lib/entries/confirm-mail";
import { paidAmount } from "@/lib/entries/fee";
import { ENTRY_STATUS } from "@/lib/entries/status-codes";

export type ConfirmResult = "confirmed" | "confirmed_mail_failed" | "not_confirmable";

/**
 * Potvrzení přihlášky (stav 3/4 → 5) + potvrzovací e-mail. Bez kontroly oprávnění –
 * volá ho admin akce (po requireStaff) i job párování plateb.
 * Podmíněný update brání dvojímu potvrzení / mailu při souběhu.
 */
export async function confirmRegistrationCore(
  year: number,
  id: number,
  options: { site?: string } = {},
): Promise<ConfirmResult> {
  const row = await prisma.registration.findUnique({
    where: { year_id: { year, id } },
    include: {
      lines: {
        include: {
          runner: { select: { name: true } },
          club: { select: { name: true } },
          category: { select: { name: true } },
        },
        orderBy: { runnerId: "asc" },
      },
    },
  });
  if (!row || (row.status !== ENTRY_STATUS.paid && row.status !== ENTRY_STATUS.overpaid)) {
    return "not_confirmable";
  }
  const updated = await prisma.registration.updateMany({
    where: { year, id, status: { in: [ENTRY_STATUS.paid, ENTRY_STATUS.overpaid] } },
    data: { status: ENTRY_STATUS.confirmed },
  });
  if (updated.count !== 1) return "not_confirmable";
  const paidTotal = await paidAmount(year, id);
  const fee = row.lines.reduce((sum, line) => sum + (line.entryFee ?? 0), 0);
  const sent = await sendConfirmationEmail({
    year,
    id,
    email: row.email,
    name: row.name,
    lines: row.lines.map((line) => ({
      runner: line.runner.name,
      club: line.club.name,
      category: line.category.name,
      fee: line.entryFee ?? 0,
    })),
    fee,
    paid: paidTotal,
    site: options.site,
  });
  return sent ? "confirmed" : "confirmed_mail_failed";
}
