/**
 * Club ids (#104, Q34). `cis_klub.id` is varchar(8) since 20261022130000_club_identity_by_id
 * (legacy char(3)). Letter ids (CHC, PHK …) come from the legacy admin; new clubs created by
 * a registration get the next free number. Pure, no DB access.
 */

/** Longest club id (column varchar(8)). */
export const CLUB_ID_MAX_LENGTH = 8;

/** First number for registration-created clubs (legacy started numeric ids at 111). */
export const FIRST_NUMERIC_CLUB_ID = 111;

/** Numeric value of an all-digit id ("216" → 216), else null ("CHC", "P10"). */
export function numericClubId(id: string): number | null {
  const trimmed = id.trim();
  return /^\d+$/.test(trimmed) ? Number.parseInt(trimmed, 10) : null;
}

/**
 * Next numeric club id after the highest existing one, continuing past 999 (1000, 1001 …).
 * Never wraps around: the old char(3) code restarted at 111 and could reuse an existing id.
 */
export function nextNumericClubIdFrom(ids: readonly string[]): string {
  const numbers = ids.map(numericClubId).filter((value): value is number => value !== null);
  const next = Math.max(FIRST_NUMERIC_CLUB_ID - 1, ...numbers) + 1;
  const id = String(next);
  if (id.length > CLUB_ID_MAX_LENGTH) {
    throw new Error("No numeric club id left (varchar(8)).");
  }
  return id;
}
