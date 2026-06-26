import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * Prisma 7+ configuration.
 * Connection URL is provided here for Prisma tools (migrate, studio, generate, etc.).
 * Runtime PrismaClient in the app continues to rely on DATABASE_URL (loaded via src/lib/env.ts + .env).
 *
 * We explicitly load .env here because `prisma migrate` commands evaluate this config
 * before the normal Prisma/.env loading that the app uses.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    // Configures `prisma db seed` / `pnpm prisma:seed`
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env.DATABASE_URL,
    // Dedicated shadow database (different DB name).
    // Required for `prisma migrate dev` on MySQL/MariaDB.
    // The `mcvv` user must have full rights on this DB (see below).
    // See: https://pris.ly/d/migrate-shadow
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
