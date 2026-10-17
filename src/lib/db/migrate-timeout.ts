/** Default limit for `prisma migrate deploy` in scripts/db-migrate.ts. */
export const DEFAULT_MIGRATE_TIMEOUT_SECONDS = 900;
const MIN_SECONDS = 30;
const MAX_SECONDS = 3600;

/**
 * DB_MIGRATE_TIMEOUT_SECONDS (integer, 30–3600) → milliseconds.
 * Missing or invalid values fall back to 900 s; out-of-range values are clamped.
 */
export function migrateTimeoutMs(env: Record<string, string | undefined> = process.env): number {
  const raw = env.DB_MIGRATE_TIMEOUT_SECONDS?.trim();
  const parsed = raw && /^\d+$/.test(raw) ? Number(raw) : DEFAULT_MIGRATE_TIMEOUT_SECONDS;
  return Math.min(MAX_SECONDS, Math.max(MIN_SECONDS, parsed)) * 1000;
}
