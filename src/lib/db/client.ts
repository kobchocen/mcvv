import { env } from "@/lib/env";
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { currentTestContext } from "@/lib/testmode/context";
import { lookupVerdict, testWriteVerdict } from "@/lib/testmode/gate-core";
import { TestWriteBlockedError } from "@/lib/testmode/context";
import { databaseOptions } from "./options";

declare global {
  var prisma: PrismaClient | undefined;
}

let client: PrismaClient | undefined;

/**
 * Zápisová brána testovacího režimu (B+): mimo testovací kontext nedělá nic. V kontextu
 * pustí jen zápisy do stínového roku a testovacích tabulek, jinak vyhodí chybu.
 */
export function withTestWriteGate(base: PrismaClient): PrismaClient {
  return base.$extends({
    name: "mcvv-test-write-gate",
    query: {
      async $allOperations({ model, operation, args, query }) {
        const ctx = currentTestContext();
        if (ctx) {
          let verdict = testWriteVerdict(ctx, model, operation, args);
          if (verdict.ok === "lookup") {
            const delegate = (base as unknown as Record<string, unknown>)[
              verdict.model.charAt(0).toLowerCase() + verdict.model.slice(1)
            ] as { findUnique: (q: unknown) => Promise<{ year: number } | null> };
            verdict = lookupVerdict(
              ctx,
              await delegate.findUnique({ where: verdict.where, select: { year: true } }),
            );
          }
          if (verdict.ok !== true) {
            const reason = "reason" in verdict ? verdict.reason : "neznámý důvod";
            console.error("[testmode] write blocked", reason);
            throw new TestWriteBlockedError(reason);
          }
        }
        return query(args);
      },
    },
  }) as unknown as PrismaClient;
}

function getClient() {
  client ??=
    global.prisma ??
    withTestWriteGate(new PrismaClient({ adapter: new PrismaMariaDb(databaseOptions(env)) }));
  if (env.NODE_ENV !== "production") global.prisma = client;
  return client;
}

// Builds and liveness probes do not need database credentials or a connection.
export const prisma = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const instance = getClient();
    const value = Reflect.get(instance, property);
    return typeof value === "function" ? value.bind(instance) : value;
  },
});
