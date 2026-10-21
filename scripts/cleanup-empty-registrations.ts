/**
 * One-off: smaže prázdné přihlášky aktuálního ročníku, které dřív vznikaly automaticky
 * návštěvou /prihlasky (přihláška teď vzniká až s prvním běžcem).
 *
 * Maže JEN přihlášky aktuálního ročníku ve stavu 1 bez běžců, plateb, vláken zpráv,
 * bankovních transakcí a záznamu v mcvv_prihlaska_meta; nikdy přihlášku č. 1 (pořadatelé).
 * Výchozí je suchý běh (jen výpis). Mazání až s --apply. Odmítne nelokální DB bez
 * --allow-remote (na STG/produkci spouštět jen po domluvě).
 *
 *   node --import tsx scripts/cleanup-empty-registrations.ts [--year=2026] [--apply]
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { env } from "../src/lib/env";
import { databaseOptions } from "../src/lib/db/options";
import { paymentRegistrationId } from "../src/lib/admin/parse";
import {
  cleanupVerdict,
  parseCleanupArgs,
  type CleanupVerdict,
} from "../src/lib/entries/empty-registrations";
import { ENTRY_STATUS } from "../src/lib/entries/status-codes";

async function main() {
  const args = parseCleanupArgs(process.argv.slice(2));
  const options = databaseOptions(env);
  const host = String(options.host ?? "");
  if (!["127.0.0.1", "localhost", "::1"].includes(host) && !args.allowRemote) {
    throw new Error(
      `Refusing to run against non-local host "${host}" (use --allow-remote deliberately).`,
    );
  }
  const client = new PrismaClient({ adapter: new PrismaMariaDb(options) });
  try {
    const latest = await client.edition.findFirst({
      orderBy: { id: "desc" },
      select: { date: true, id: true },
    });
    const year = args.year ?? latest?.date.getUTCFullYear() ?? new Date().getFullYear();
    const [registrations, payments, threads, bankTxs, metas] = await Promise.all([
      client.registration.findMany({
        where: { year, status: ENTRY_STATUS.empty },
        select: {
          year: true,
          id: true,
          status: true,
          created: true,
          _count: { select: { lines: true } },
        },
        orderBy: { id: "asc" },
      }),
      client.payment.findMany({ where: { year }, select: { registrationId: true } }),
      client.messageThread.findMany({
        where: { year, registrationId: { not: null } },
        select: { registrationId: true },
      }),
      client.bankTx.findMany({
        where: { year, registrationId: { not: null } },
        select: { registrationId: true },
      }),
      client.registrationMeta.findMany({ where: { year }, select: { id: true } }),
    ]);
    const count = (ids: number[]) => {
      const map = new Map<number, number>();
      for (const id of ids) map.set(id, (map.get(id) ?? 0) + 1);
      return map;
    };
    const paymentsById = count(payments.map((row) => paymentRegistrationId(row.registrationId)));
    const threadsById = count(threads.map((row) => row.registrationId!));
    const bankById = count(bankTxs.map((row) => row.registrationId!));
    const metaIds = new Set(metas.map((row) => row.id));

    const verdicts = new Map<CleanupVerdict, number>();
    const deletable: { id: number; created: Date | null }[] = [];
    for (const row of registrations) {
      const verdict = cleanupVerdict(
        {
          year: row.year,
          id: row.id,
          status: row.status,
          lines: row._count.lines,
          payments: paymentsById.get(row.id) ?? 0,
          threads: threadsById.get(row.id) ?? 0,
          bankTxs: bankById.get(row.id) ?? 0,
          hasMeta: metaIds.has(row.id),
        },
        year,
      );
      verdicts.set(verdict, (verdicts.get(verdict) ?? 0) + 1);
      if (verdict === "delete") deletable.push({ id: row.id, created: row.created });
    }

    console.log(`Ročník ${year}: přihlášek ve stavu 1: ${registrations.length}`);
    for (const [verdict, n] of verdicts) console.log(`  ${verdict}: ${n}`);
    console.log(
      `K smazání (${deletable.length}): ${deletable.map((row) => `č. ${row.id}`).join(", ") || "—"}`,
    );
    if (!args.apply) {
      console.log("Suchý běh – nic se nesmazalo (smazat: --apply).");
      return;
    }
    let deleted = 0;
    for (const row of deletable) {
      // Znovu ověřit v transakci (mezitím mohl přibýt běžec, platba, zpráva…).
      deleted += await client.$transaction(async (tx) => {
        const fresh = await tx.registration.findUnique({
          where: { year_id: { year, id: row.id } },
          select: { status: true, _count: { select: { lines: true } } },
        });
        const [pay, thr, bank, meta] = await Promise.all([
          tx.payment.findMany({ where: { year }, select: { registrationId: true } }),
          tx.messageThread.count({ where: { year, registrationId: row.id } }),
          tx.bankTx.count({ where: { year, registrationId: row.id } }),
          tx.registrationMeta.count({ where: { year, id: row.id } }),
        ]);
        const verdict = fresh
          ? cleanupVerdict(
              {
                year,
                id: row.id,
                status: fresh.status,
                lines: fresh._count.lines,
                payments: pay.filter((p) => paymentRegistrationId(p.registrationId) === row.id)
                  .length,
                threads: thr,
                bankTxs: bank,
                hasMeta: meta > 0,
              },
              year,
            )
          : null;
        if (verdict !== "delete") return 0;
        const result = await tx.registration.deleteMany({
          where: { year, id: row.id, status: ENTRY_STATUS.empty, lines: { none: {} } },
        });
        return result.count;
      });
    }
    console.log(`Smazáno: ${deleted}`);
  } finally {
    await client.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
