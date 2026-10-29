import { diffFields, type AuditChange } from "@/lib/audit/diff";

/**
 * Pomocníci pro audit startovky a partnerů (#107). Cíl ve formátu `entita:id`, detail
 * `changes` = před / po (`diffFields`), aby se zobrazil v /admin/audit.
 */

/** Řádek startovky = běžec v ročníku. */
export function startLineTarget(year: number, runnerId: string): string {
  return `startlist:${year}/${runnerId}`;
}

/** Celá startovka ročníku (hromadné operace, např. uložení návrhu). */
export function startListTarget(year: number): string {
  return `startlist:${year}`;
}

export function startGroupTarget(id: number): string {
  return `start_group:${id}`;
}

export function partnerTarget(id: number): string {
  return `partner:${id}`;
}

type Keyed = Record<string, unknown>;

/** Klíče `<bezec>.<pole>` – víc řádků v jednom záznamu (prohození, návrh, skupina). */
function keyed(rows: Record<string, Keyed>): Keyed {
  const out: Keyed = {};
  for (const [runnerId, fields] of Object.entries(rows)) {
    for (const [field, value] of Object.entries(fields)) {
      out[`${runnerId}.${field}`] = value;
    }
  }
  return out;
}

/** Změny více řádků startovky (před / po) s klíči `<bezec>.<pole>`. */
export function lineChanges(
  before: Record<string, Keyed>,
  after: Record<string, Keyed>,
): Record<string, AuditChange> {
  return diffFields(keyed(before), keyed(after));
}

/** Snímek skupiny startu pro audit (členové v pořadí). */
export function startGroupSnapshot(group: {
  kind: string;
  note: string | null;
  members: string[];
}): Keyed {
  return { kind: group.kind, note: group.note, members: group.members.join(", ") };
}

/** Pole partnera do auditu – bez binárních dat loga (jen typ a otisk). */
export type PartnerAuditFields = {
  name: string | null;
  link: string | null;
  image: string | null;
  category: number;
  order: number;
  active: boolean | null;
  description: string;
  general?: boolean;
  logoType?: string | null;
  logoHash?: string | null;
};

export function partnerSnapshot(partner: PartnerAuditFields): Keyed {
  const { logoType, logoHash, ...rest } = partner;
  return {
    ...rest,
    ...(logoType !== undefined ? { logoType } : {}),
    ...(logoHash !== undefined ? { logoHash } : {}),
  };
}
