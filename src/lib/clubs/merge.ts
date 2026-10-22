/**
 * What a confirmed merge of two club ids does (#104). Pure; the admin action applies it.
 * Nothing calls this automatically – only a person who picked the main id in the admin.
 * Merges stay flat: a main id is never merged itself, so one lookup gives the main id.
 */
import { clubKey, type ClubMergeRef } from "./core";

export type ClubMergePlan =
  | {
      ok: true;
      mainId: string;
      /** Rows to upsert into mcvv_klub_slouceni (the merged id and ids already under it). */
      rows: ClubMergeRef[];
    }
  | { ok: false; error: "same" | "empty" | "main_merged" | "other_merged" };

export function planClubMerge(
  mainIdRaw: string,
  otherIdRaw: string,
  merges: readonly ClubMergeRef[],
): ClubMergePlan {
  const mainId = clubKey(mainIdRaw);
  const otherId = clubKey(otherIdRaw);
  if (!mainId || !otherId) return { ok: false, error: "empty" };
  if (mainId === otherId) return { ok: false, error: "same" };
  const mainOf = new Map(merges.map((row) => [clubKey(row.clubId), clubKey(row.mainClubId)]));
  if (mainOf.has(mainId)) return { ok: false, error: "main_merged" };
  if (mainOf.has(otherId)) return { ok: false, error: "other_merged" };
  const rows: ClubMergeRef[] = [
    { clubId: otherId, mainClubId: mainId },
    // Ids merged into the other id move under the new main id (stays flat).
    ...[...mainOf.entries()]
      .filter(([, main]) => main === otherId)
      .map(([clubId]) => ({ clubId, mainClubId: mainId })),
  ];
  return { ok: true, mainId, rows };
}

/** Canonical (order independent) pair of two ids, used for rejected suggestions. */
export function clubPair(a: string, b: string): [string, string] {
  const x = clubKey(a);
  const y = clubKey(b);
  return x < y ? [x, y] : [y, x];
}
