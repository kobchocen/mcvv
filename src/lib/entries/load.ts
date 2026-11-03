import { paymentRegistrationId } from "@/lib/admin/parse";
import { prisma } from "@/lib/db/client";
import { nextStatus } from "@/lib/entries/status";
import { buildQuickList, withLastClub } from "@/lib/entries/quick";
import { currentRaceYear } from "@/lib/entries/year";
import {
  emailEquals,
  isCancelledStatus,
  pickCancelledRegistrations,
} from "@/lib/entries/ensure-core";
import type { SlotType } from "@/lib/slots/core";
import { orderMyEntries, registrationWritable, splitMyEntries } from "@/lib/slots/entry-slot";
import { pastRegistrationKeys } from "@/lib/entries/load-core";

const registrationInclude = {
  lines: {
    include: {
      runner: { select: { id: true, name: true } },
      club: { select: { id: true, name: true } },
      category: { select: { name: true, entryFee: true } },
    },
    orderBy: { runnerId: "asc" as const },
  },
};

/**
 * Data stránky /prihlasky pro přihlášený e-mail.
 *
 * #189: stránka se vykresluje znovu po každé akci (rychlá nabídka, nový běžec, klub, odebrání),
 * proto se dřív načítaly všechny přihlášky ročníku i všech minulých let i s řádky a filtrovaly
 * až tady. Teď se načte jen lehký index (rok, číslo, e-mail, stav, název), e-mail se porovná stejně
 * jako dřív (trim + bez ohledu na velikost písmen) a řádky se dočtou jen u vlastních přihlášek.
 * Nezávislé dotazy běží souběžně.
 */
export async function loadMyEntry(email: string) {
  const { year, open, deadline, slots } = await currentRaceYear();
  const index = await prisma.registration.findMany({
    select: { year: true, id: true, email: true, status: true, name: true },
  });
  const yearIndex = index.filter((row) => row.year === year);
  // Přihláška se tu už nezakládá – vzniká až s prvním běžcem (ensureRegistration).
  // Jedna přihláška na e-mail a termín (Q302): může jich být víc; nahoře ta, kterou lze měnit
  // (běžící termín), jinak nejnovější zamčená (jen čtení).
  const mineActive = yearIndex.filter(
    (row) => emailEquals(row.email, email) && !isCancelledStatus(row.status),
  );
  const metas =
    mineActive.length > 0
      ? await prisma.registrationMeta.findMany({
          where: { year, id: { in: mineActive.map((row) => row.id) } },
          select: { id: true, slot: true },
        })
      : [];
  const slotById = new Map(metas.map((meta) => [meta.id, meta.slot]));
  const ctx = { year, open, slots, now: new Date() };
  const entries = orderMyEntries(
    mineActive.map((row) => {
      const slot = slotById.get(row.id) ?? null;
      return {
        year: row.year,
        id: row.id,
        name: row.name,
        status: row.status,
        slot,
        writable: registrationWritable(ctx, { year: row.year, status: row.status, slot }),
      };
    }),
  );
  const { primary: active, locked: lockedRefs } = splitMyEntries(entries, open);
  const cancelled = pickCancelledRegistrations(yearIndex, email).map((row) => ({
    year: row.year,
    id: row.id,
    name: row.name,
  }));
  const pastKeys = pastRegistrationKeys(index, year, email);

  const [current, lockedRows, minePast, yearPayments] = await Promise.all([
    active
      ? prisma.registration.findUnique({
          where: { year_id: { year: active.year, id: active.id } },
          include: registrationInclude,
        })
      : null,
    lockedRefs.length > 0
      ? prisma.registration.findMany({
          where: { year, id: { in: lockedRefs.map((entry) => entry.id) } },
          include: registrationInclude,
        })
      : [],
    pastKeys.length > 0
      ? prisma.registration.findMany({
          where: { OR: pastKeys },
          include: {
            lines: { select: { runnerId: true, runner: { select: { id: true, name: true } } } },
          },
          orderBy: [{ year: "desc" }, { id: "asc" }],
        })
      : [],
    entries.length > 0
      ? prisma.payment.findMany({ where: { year }, orderBy: [{ date: "asc" }, { id: "asc" }] })
      : [],
  ]);
  const paymentsOf = (id: number) =>
    yearPayments.filter((payment) => paymentRegistrationId(payment.registrationId) === id);
  // Uzavřené přihlášky (jen čtení) v pořadí `entries` – i s běžci a platbami.
  const lockedById = new Map(lockedRows.map((row) => [row.id, row]));
  const locked = lockedRefs.flatMap((entry) => {
    const row = lockedById.get(entry.id);
    return row
      ? [{ ...row, slot: entry.slot as SlotType | null, payments: paymentsOf(row.id) }]
      : [];
  });

  // Rychlá nabídka: běžci z minulých přihlášek, kteří letos ještě nejsou přihlášení.
  const pastRunners = minePast.flatMap((row) =>
    row.lines.map((line) => ({ id: line.runnerId, name: line.runner.name })),
  );
  const pastRunnerIds = [...new Set(pastRunners.map((runner) => runner.id))];
  const [takenLines, pastLines] =
    pastRunnerIds.length > 0
      ? await Promise.all([
          prisma.registrationLine.findMany({
            where: { year, runnerId: { in: pastRunnerIds } },
            select: { runnerId: true },
          }),
          // Klub z poslední přihlášky běžce (kterékoli, ne jen vlastní) – id rozhoduje (Q35).
          prisma.registrationLine.findMany({
            where: { year: { lt: year }, runnerId: { in: pastRunnerIds } },
            select: { runnerId: true, year: true, clubId: true, club: { select: { name: true } } },
          }),
        ])
      : [[], []];
  const thisYearTaken = new Set(takenLines.map((row) => row.runnerId));
  const quickRunners = buildQuickList(
    pastRunners.filter((runner) => !thisYearTaken.has(runner.id)),
  );
  const quick = withLastClub(
    quickRunners,
    pastLines.map((line) => ({
      runnerId: line.runnerId,
      year: line.year,
      clubId: line.clubId,
      clubName: line.club.name,
    })),
  );

  let registration = current;
  const payments = registration ? paymentsOf(registration.id) : [];
  if (registration) {
    // Stejný přepočet jako recalculateRegistrationStatus, jen z už načtených dat (bez dalšího
    // čtení přihlášky, řádků a plateb a bez opětovného načtení přihlášky).
    const fee = registration.lines.reduce((sum, line) => sum + (line.entryFee ?? 0), 0);
    const paid = payments.reduce((sum, payment) => sum + (payment.amount ?? 0), 0);
    const status = nextStatus(registration.status, registration.lines.length, fee, paid);
    if (status !== registration.status) {
      await prisma.registration.update({
        where: { year_id: { year: registration.year, id: registration.id } },
        data: { status },
      });
      registration = { ...registration, status };
    }
  }

  return {
    year,
    open,
    deadline,
    registration,
    /** Termín hlavní přihlášky (null = standard / ročník bez termínů). */
    slot: active?.slot ?? null,
    /** Lze hlavní přihlášku měnit z webu (její termín běží)? */
    writable: active?.writable ?? false,
    /** Všechny nezrušené přihlášky e-mailu v ročníku (pořadí: měnitelná, pak zamčené). */
    entries,
    /** Ostatní (uzavřené) přihlášky ročníku s běžci a platbami – jen ke čtení. */
    locked,
    slots,
    cancelled,
    past: minePast,
    quick,
    payments,
  };
}
