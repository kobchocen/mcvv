import type { Prisma } from "@prisma/client";

import { zonedCivilToUtc } from "@/lib/date/race-schedule";

/** Skupiny akcí (prefix před tečkou) pro filtr v /admin/audit. */
export const AUDIT_GROUPS = [
  "runner",
  "club",
  "entry",
  "registration",
  "payment",
  "bank_tx",
  "edition",
  "category",
  "settings",
  "user",
  "raceday",
  "sale",
  "sale_item",
  "startlist",
  "partner",
] as const;

export type AuditGroup = (typeof AUDIT_GROUPS)[number];

export const AUDIT_PAGE_SIZE = 50;

export type AuditFilters = {
  group: AuditGroup | null;
  action: string | null;
  actor: string;
  target: string;
  from: string | null;
  to: string | null;
  page: number;
};

export type AuditSearchParams = {
  skupina?: string;
  akce?: string;
  kdo?: string;
  cil?: string;
  od?: string;
  do?: string;
  strana?: string;
};

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ACTION_RE = /^[a-z_]+\.[a-z_]+$/;

function isGroup(value: string | undefined): value is AuditGroup {
  return AUDIT_GROUPS.includes(value as AuditGroup);
}

function dateParam(value: string | undefined): string | null {
  const match = DATE_RE.exec(value ?? "");
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const check = new Date(Date.UTC(year, month - 1, day));
  return check.getUTCMonth() === month - 1 && check.getUTCDate() === day ? match[0] : null;
}

export function parseAuditFilters(sp: AuditSearchParams): AuditFilters {
  return {
    group: isGroup(sp.skupina) ? sp.skupina : null,
    action: sp.akce && ACTION_RE.test(sp.akce) ? sp.akce.slice(0, 64) : null,
    actor: (sp.kdo ?? "").trim().slice(0, 80),
    target: (sp.cil ?? "").trim().slice(0, 80),
    from: dateParam(sp.od),
    to: dateParam(sp.do),
    page: Math.max(1, Number.parseInt(sp.strana ?? "", 10) || 1),
  };
}

/** Začátek dne (Europe/Prague) daného `YYYY-MM-DD`, posunutý o `addDays`. */
function pragueDayStart(value: string, addDays = 0): Date {
  const [year, month, day] = value.split("-").map(Number);
  const shifted = new Date(Date.UTC(year, month - 1, day + addDays));
  return zonedCivilToUtc(
    shifted.getUTCFullYear(),
    shifted.getUTCMonth() + 1,
    shifted.getUTCDate(),
    0,
    0,
  );
}

export function auditWhere(filters: AuditFilters): Prisma.AuditLogWhereInput {
  const createdAt: Prisma.DateTimeFilter = {};
  if (filters.from) createdAt.gte = pragueDayStart(filters.from);
  if (filters.to) createdAt.lt = pragueDayStart(filters.to, 1);
  return {
    ...(filters.action
      ? { action: filters.action }
      : filters.group
        ? { action: { startsWith: `${filters.group}.` } }
        : {}),
    ...(filters.actor ? { actorEmail: { contains: filters.actor } } : {}),
    ...(filters.target ? { target: { contains: filters.target } } : {}),
    ...(filters.from || filters.to ? { createdAt } : {}),
  };
}

/** Query string filtru (bez stránky) pro odkazy stránkování. */
export function auditQuery(filters: AuditFilters): Record<string, string> {
  return {
    ...(filters.group ? { skupina: filters.group } : {}),
    ...(filters.action ? { akce: filters.action } : {}),
    ...(filters.actor ? { kdo: filters.actor } : {}),
    ...(filters.target ? { cil: filters.target } : {}),
    ...(filters.from ? { od: filters.from } : {}),
    ...(filters.to ? { do: filters.to } : {}),
  };
}
