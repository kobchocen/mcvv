import assert from "node:assert/strict";
import { test } from "node:test";
import { Prisma, type PrismaClient } from "@prisma/client";
import { checkDatabase, verifyMigrationHistory } from "./check";

const expected = [{ name: "initial", checksum: "sha256" }];
const applied = [
  { migration_name: "initial", checksum: "sha256", finished_at: new Date(), rolled_back_at: null },
];

test("migration history rejects pending, modified, failed and unexpected migrations", () => {
  verifyMigrationHistory(expected, applied);
  assert.throws(() => verifyMigrationHistory(expected, []));
  assert.throws(() => verifyMigrationHistory([], []));
  assert.throws(() => verifyMigrationHistory(expected, [{ ...applied[0], checksum: "changed" }]));
  assert.throws(() => verifyMigrationHistory(expected, [{ ...applied[0], finished_at: null }]));
  assert.throws(() =>
    verifyMigrationHistory(expected, [...applied, { ...applied[0], migration_name: "unknown" }]),
  );
  verifyMigrationHistory(expected, [
    ...applied,
    { ...applied[0], finished_at: null, rolled_back_at: new Date() },
  ]);
});

function database(cipher: string, schemaFailure = false) {
  const queries: string[] = [];
  const transaction = {
    $queryRaw: async (sql: TemplateStringsArray) => {
      const query = sql.join("");
      queries.push(query);
      if (query.includes("Ssl_cipher")) return [{ Value: cipher }];
      if (query.includes("_prisma_migrations")) return applied;
      return [{ result: 1 }];
    },
    $queryRawUnsafe: async (query: string) => {
      queries.push(query);
      if (schemaFailure) throw new Error("Missing schema column");
      return [];
    },
  };
  const client = {
    $transaction: async (callback: (tx: typeof transaction) => Promise<void>) =>
      callback(transaction),
  } as unknown as PrismaClient;
  return { client, queries };
}

test("database check uses the same session for TLS and checks every model's columns", async () => {
  const { client, queries } = database("TLS_AES_256_GCM_SHA384");
  await checkDatabase(client, true, expected);
  assert.equal(
    queries.filter((query) => query.includes("LIMIT 0")).length,
    Prisma.dmmf.datamodel.models.length,
  );
  assert.ok(queries.some((query) => query.includes("`image`") && query.includes("`mcvv_fotky`")));
});

test("database check fails on plaintext connections and broken schemas", async () => {
  await assert.rejects(checkDatabase(database("").client, true, expected), /TLS/);
  await assert.rejects(
    checkDatabase(database("TLS", true).client, true, expected),
    /Missing schema/,
  );
});
