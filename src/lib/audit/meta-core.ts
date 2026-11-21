/**
 * Metadata auditního záznamu (`mcvv_audit_meta`, P7): ročník, startovní číslo, typ entity,
 * zdroj a role aktéra – kvůli rychlým filtrům (historie čísla, den závodu) bez hledání
 * v textu `target` a v JSON. Čisté funkce.
 */

export type AuditSource = "web" | "device" | "system";

export type AuditMetaInput = {
  year?: number | null;
  bib?: number | null;
  entity?: string | null;
  source?: AuditSource | null;
};

export type AuditMetaRow = {
  year: number | null;
  bib: number | null;
  entity: string | null;
  source: AuditSource | null;
  actorRoles: string | null;
};

const YEAR = /(?:^|[:/])((?:19|20)\d{2})(?=$|[:/])/;

/** Ročník, číslo a entita z cíle akce (`start:2026:15`, `split:2026:K1:15`, `registration:2026/3` …). */
export function metaFromTarget(target: string | null | undefined): AuditMetaInput {
  if (!target) return {};
  const start = /^start:(\d{4}):(\d{1,4})$/.exec(target);
  if (start) return { year: Number(start[1]), bib: Number(start[2]), entity: "start" };
  const split = /^split:(\d{4}):[^:]+:(\d{1,4})$/.exec(target);
  if (split) return { year: Number(split[1]), bib: Number(split[2]), entity: "split" };
  const year = YEAR.exec(target);
  const prefix = /^([a-z_]+)[:/]?/.exec(target)?.[1] ?? null;
  return { year: year ? Number(year[1]) : null, entity: prefix };
}

function smallInt(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 32767
    ? value
    : null;
}

/** Výsledný řádek metadat: výslovné hodnoty mají přednost před odvozenými z cíle. */
export function auditMetaRow(input: {
  action: string;
  target?: string | null;
  meta?: AuditMetaInput;
  actorRoles?: readonly string[];
  systemJob?: string | null;
}): AuditMetaRow {
  const derived = metaFromTarget(input.target);
  const explicit = input.meta ?? {};
  const entity = (explicit.entity ?? derived.entity ?? input.action.split(".")[0] ?? null)?.slice(
    0,
    24,
  );
  const roles = input.systemJob ? [`system:${input.systemJob}`] : (input.actorRoles ?? []);
  return {
    year: smallInt(explicit.year ?? derived.year),
    bib: smallInt(explicit.bib ?? derived.bib),
    entity: entity || null,
    source: explicit.source ?? (input.systemJob ? "system" : "web"),
    actorRoles: roles.length ? roles.join(",").slice(0, 160) : null,
  };
}
