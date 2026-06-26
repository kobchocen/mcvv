import { env } from "@/lib/env";
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

declare global {
  var prisma: PrismaClient | undefined;
}

function createPrismaClient() {
  // Parse standard mysql:// or mariadb:// connection string for the driver adapter.
  // Required for Prisma 7 "client" engine + direct DB connections.
  const url = new URL(env.DATABASE_URL);

  const adapter = new PrismaMariaDb({
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: url.username,
    password: url.password || undefined,
    database: url.pathname.replace(/^\//, ""),
    // Add other mariadb options here if needed (e.g. connectionLimit, ssl)
  });

  return new PrismaClient({
    adapter,
    log: env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });
}

/**
 * Shared Prisma client that survives hot reloads in development.
 * Uses driver adapter because Prisma 7 requires it for direct MySQL/MariaDB connections.
 */
export const prisma = global.prisma ?? createPrismaClient();

if (env.NODE_ENV !== "production") {
  global.prisma = prisma;
}
