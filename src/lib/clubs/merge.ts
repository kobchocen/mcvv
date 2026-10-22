/**
 * What a confirmed merge of two club ids does (#104, Q45). Pure; `merge-apply.ts` applies it.
 * Nothing calls this automatically – only a person who picked the main id in the admin.
 *
 * A merge REWRITES the data: every row of the merged id gets the main id and the merged id
 * disappears from `cis_klub`. `cis_klub` holds one name per id and edition, so per edition:
 * - only the merged id has a row → the row moves to the main id (that edition's name stays),
 * - both ids have a row (collision) → the main id's row and name win, the merged row is
 *   dropped (its name is kept only in the audit entry),
 * - neither has a row but entries / starts / results of the merged id exist (legacy rows
 *   imported without a codebook row) → a row of the main id is created with its newest name,
 *   so the foreign keys hold.
 * Irreversible in the app; the audit entry holds the full before-state for a manual repair.
 */
import { clubKey } from "./core";

/** Club id that means "no club" (entries without a club); never merged. */
const NO_CLUB_ID = "000";

/** One `cis_klub` row of an id (`created` as text: legacy rows hold '0000-00-00'). */
export type ClubYearRow = {
  year: number;
  name: string;
  created: string | null;
  author: string | null;
};

export type ClubMergeError = "empty" | "same" | "no_club" | "unknown_main" | "unknown_other";

export type ClubMergePlan =
  | {
      ok: true;
      mainId: string;
      otherId: string;
      /** Editions whose `cis_klub` row of the merged id moves to the main id. */
      moveYears: number[];
      /** Editions where both ids have a row: the merged id's row is dropped. */
      dropYears: number[];
      /** Editions without any row but with rows of the merged id: a main id row is created. */
      createYears: { year: number; name: string }[];
    }
  | { ok: false; error: ClubMergeError };

export function planClubMerge(input: {
  mainId: string;
  otherId: string;
  mainRows: readonly ClubYearRow[];
  otherRows: readonly ClubYearRow[];
  /** Editions with rows of the merged id in mcvv_prihlaska_radek / mcvv_start / mcvv_time. */
  rowYears: readonly number[];
}): ClubMergePlan {
  const mainId = clubKey(input.mainId);
  const otherId = clubKey(input.otherId);
  if (!mainId || !otherId) return { ok: false, error: "empty" };
  if (mainId === otherId) return { ok: false, error: "same" };
  if (mainId === NO_CLUB_ID || otherId === NO_CLUB_ID) return { ok: false, error: "no_club" };
  if (input.mainRows.length === 0) return { ok: false, error: "unknown_main" };
  if (input.otherRows.length === 0) return { ok: false, error: "unknown_other" };

  const mainYears = new Set(input.mainRows.map((row) => row.year));
  const otherYears = new Set(input.otherRows.map((row) => row.year));
  const sorted = (years: Iterable<number>) => [...new Set(years)].sort((a, b) => a - b);
  const newestMain = [...input.mainRows].sort((a, b) => b.year - a.year)[0];
  return {
    ok: true,
    mainId,
    otherId,
    moveYears: sorted([...otherYears].filter((year) => !mainYears.has(year))),
    dropYears: sorted([...otherYears].filter((year) => mainYears.has(year))),
    createYears: sorted(
      input.rowYears.filter((year) => !mainYears.has(year) && !otherYears.has(year)),
    ).map((year) => ({ year, name: newestMain.name.trim() })),
  };
}

/** Canonical (order independent) pair of two ids, used for rejected suggestions. */
export function clubPair(a: string, b: string): [string, string] {
  const x = clubKey(a);
  const y = clubKey(b);
  return x < y ? [x, y] : [y, x];
}
