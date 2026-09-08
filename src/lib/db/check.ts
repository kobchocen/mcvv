import { Prisma, type PrismaClient } from "@prisma/client";

export type Migration = { name: string; checksum: string };
type AppliedMigration = {
  migration_name: string;
  checksum: string;
  finished_at: Date | null;
  rolled_back_at: Date | null;
};

export function verifyMigrationHistory(expected: Migration[], applied: AppliedMigration[]) {
  const active = applied.filter((migration) => migration.rolled_back_at === null);
  if (
    expected.length === 0 ||
    active.length !== expected.length ||
    active.some((migration) => !migration.finished_at) ||
    expected.some(
      (migration) =>
        !active.some(
          (row) => row.migration_name === migration.name && row.checksum === migration.checksum,
        ),
    )
  ) {
    throw new Error("Database migration history does not match this release");
  }
}

export async function checkDatabase(
  client: PrismaClient,
  tlsRequired: boolean,
  migrations: Migration[],
) {
  await client.$transaction(
    async (transaction) => {
      await transaction.$queryRaw`SELECT 1`;
      const status = await transaction.$queryRaw<{ Variable_name: string; Value: string }[]>`
        SHOW SESSION STATUS LIKE 'Ssl_cipher'
      `;
      if (tlsRequired && !status[0]?.Value) throw new Error("Database TLS is not active");
      const applied = await transaction.$queryRaw<AppliedMigration[]>`
        SELECT migration_name, checksum, finished_at, rolled_back_at FROM _prisma_migrations
      `;
      verifyMigrationHistory(migrations, applied);
      // Identifiers come exclusively from the generated schema, never user input.
      const quote = (name: string) => "`" + name.replaceAll("`", "``") + "`";
      for (const model of Prisma.dmmf.datamodel.models) {
        const fields = model.fields
          .filter((field) => field.kind !== "object")
          .map((field) => quote(field.dbName ?? field.name));
        await transaction.$queryRawUnsafe(
          `SELECT ${fields.join(", ")} FROM ${quote(model.dbName ?? model.name)} LIMIT 0`,
        );
      }
    },
    { maxWait: 5_000, timeout: 30_000 },
  );
}
