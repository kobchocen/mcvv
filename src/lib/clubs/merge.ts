/**
 * What a confirmed merge of two written names does (#104). Pure; the admin action applies it.
 * Nothing calls this automatically – only a person confirming a suggestion in the admin.
 */
import { clubSlug } from "./core";

export type MergePlan =
  /** Neither name is mapped yet: create a canonical club with both names as aliases. */
  | { kind: "create" }
  /** One name already belongs to a club: add the other one to it. */
  | { kind: "attach"; clubId: number }
  /** Each name belongs to a different club: move all aliases of `from` into `into`. */
  | { kind: "join"; into: number; from: number }
  /** Both names already belong to the same club. */
  | { kind: "noop"; clubId: number };

export function planClubMerge(clubOfA: number | null, clubOfB: number | null): MergePlan {
  if (clubOfA && clubOfB) {
    return clubOfA === clubOfB
      ? { kind: "noop", clubId: clubOfA }
      : { kind: "join", into: clubOfA, from: clubOfB };
  }
  if (clubOfA || clubOfB) {
    return { kind: "attach", clubId: (clubOfA ?? clubOfB) as number };
  }
  return { kind: "create" };
}

/** Slug for a new canonical club, "-2", "-3"… when taken. */
export function uniqueClubSlug(name: string, taken: ReadonlySet<string>): string {
  const base = clubSlug(name) || "klub";
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base.slice(0, 76)}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}
