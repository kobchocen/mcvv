import { createHash } from "node:crypto";

/**
 * Pořadí pořadatelů ve startovce (#382): podle počtu účastí (řádky mcvv_time, stejné
 * číslo jako „Účasti“ na /bezec/[id]) sestupně; shody láme deterministický seed odvozený
 * od sady pořadatelů. Stejná sada → stejný seed (drží se, dokud se sada nezmění).
 * Seed je součástí otisku vstupu.
 */

export type OrganizerOrderEntry = {
  runnerId: string;
  editionsCount: number;
};

/** Stabilní klíč sady: id způsobilých pořadatelů, seřazená. */
export function organizerSetKey(
  entries: readonly { runnerId: string; eligible?: boolean; special?: { kind: string } | null }[],
): string {
  return entries
    .filter((entry) => entry.eligible !== false && entry.special?.kind === "organizer")
    .map((entry) => entry.runnerId)
    .sort((a, b) => a.localeCompare(b))
    .join(",");
}

/** Deterministický seed ze sady pořadatelů (32bit, stálý pro stejný klíč). */
export function deriveOrganizerTieSeed(setKey: string): number {
  const digest = createHash("sha256").update(`mcvv-organizer-tie:${setKey}`).digest();
  return digest.readUInt32BE(0);
}

export function organizerTieHash(seed: number, runnerId: string): string {
  return createHash("sha256").update(`${seed}:${runnerId}`).digest("hex");
}

export function compareOrganizerOrder(
  a: OrganizerOrderEntry,
  b: OrganizerOrderEntry,
  seed: number,
): number {
  return (
    b.editionsCount - a.editionsCount ||
    organizerTieHash(seed, a.runnerId).localeCompare(organizerTieHash(seed, b.runnerId)) ||
    a.runnerId.localeCompare(b.runnerId)
  );
}

export function sortOrganizers<T extends OrganizerOrderEntry>(
  entries: readonly T[],
  seed: number,
): T[] {
  return [...entries].sort((a, b) => compareOrganizerOrder(a, b, seed));
}

/** Seed, který generátor skutečně použije (zadaný, nebo odvozený od sady pořadatelů). */
export function resolveOrganizerTieSeed(input: {
  entries: readonly { runnerId: string; eligible?: boolean; special?: { kind: string } | null }[];
  organizerTieSeed?: number;
}): number {
  return input.organizerTieSeed ?? deriveOrganizerTieSeed(organizerSetKey(input.entries));
}
