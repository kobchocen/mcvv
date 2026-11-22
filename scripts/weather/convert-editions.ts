/**
 * Převod původního textu počasí ročníků (`mcvv_info.weather`) na typ počasí + štítky trati
 * (`pocasi_typ`, `trat_stitky`). Původní text zůstává jako poznámka, nic se nemaže.
 *
 * Zapisuje JEN ročníky bez typu, jejichž text je jednoznačný; nejasné vypíše k ručnímu
 * doplnění v administraci (Ročníky → úprava). Výchozí je suchý běh (jen výpis), zápis až
 * s --apply. Odmítne nelokální DB bez --allow-remote – na STG/produkci spouštět jen po
 * domluvě s Pavlem (skript je připravený, na PROD nebyl spuštěn).
 *
 *   node --import tsx scripts/weather/convert-editions.ts [--apply] [--allow-remote]
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { env } from "../../src/lib/env";
import { databaseOptions } from "../../src/lib/db/options";
import {
  formatCourseTags,
  parseConversionArgs,
  planWeatherConversion,
} from "../../src/lib/editions/weather";

async function main() {
  const args = parseConversionArgs(process.argv.slice(2));
  const options = databaseOptions(env);
  const host = String(options.host ?? "");
  if (!["127.0.0.1", "localhost", "::1"].includes(host) && !args.allowRemote) {
    throw new Error(
      `Refusing to run against non-local host "${host}" (use --allow-remote deliberately).`,
    );
  }
  const client = new PrismaClient({ adapter: new PrismaMariaDb(options) });
  try {
    const editions = await client.edition.findMany({
      select: { id: true, date: true, weather: true, weatherKind: true },
    });
    const plan = planWeatherConversion(editions);
    for (const row of plan) {
      const target = row.guess.kind
        ? `${row.guess.kind}${row.guess.tags.length ? ` [${row.guess.tags.join(", ")}]` : ""}`
        : "—";
      console.log(
        `${row.year}  #${String(row.id).padStart(2)}  ${row.action.padEnd(13)}  ${target.padEnd(40)}  ${row.text ?? ""}`,
      );
    }
    const unclear = plan.filter((r) => r.action === "skip_unclear");
    console.log(
      `\nRočníků: ${plan.length}, k zápisu: ${plan.filter((r) => r.action === "set").length}, ` +
        `nejasných: ${unclear.length}, bez textu: ${plan.filter((r) => r.action === "skip_empty").length}, ` +
        `už s typem: ${plan.filter((r) => r.action === "skip_has_kind").length}`,
    );
    if (unclear.length) {
      console.log("\nNejasné – doplnit ručně v administraci:");
      for (const r of unclear)
        console.log(`  ${r.year}: „${r.text}“ – ${r.guess.reasons.join("; ")}`);
    }
    if (!args.apply) {
      console.log("\nSuchý běh – nic se nezapsalo (zápis s --apply).");
      return;
    }
    let written = 0;
    for (const row of plan) {
      if (row.action !== "set" || !row.guess.kind) continue;
      // jen když typ mezitím nikdo nevyplnil
      const res = await client.edition.updateMany({
        where: { id: row.id, weatherKind: null },
        data: { weatherKind: row.guess.kind, courseTags: formatCourseTags(row.guess.tags) },
      });
      written += res.count;
    }
    console.log(`\nZapsáno: ${written}`);
  } finally {
    await client.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
