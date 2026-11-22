/**
 * Zápisová brána testovacího režimu (B+, návrh §2 pojistka 2) – čistá logika.
 *
 * V testovacím kontextu smí zápis jen:
 * - do testovacích tabulek `mcvv_test_*`;
 * - do auditu (kdo co v testu udělal);
 * - do živých tabulek s rokem (mezičasy, Start, cíl #252) – a to jen se stínovým rokem testu.
 * Všechno ostatní (přihlášky, běžci, kluby, platby, prodejky, fronta pošty, nastavení,
 * výsledky, uživatelé …) brána odmítne. Po konci testu (readOnly) neprojde žádný zápis.
 * Chybějící rok v podmínce = odmítnuto (nebo ověření podle id, viz `needsLookup`).
 */
import { isShadowYear } from "./config-core";

export const WRITE_OPERATIONS = new Set([
  "create",
  "createMany",
  "createManyAndReturn",
  "update",
  "updateMany",
  "updateManyAndReturn",
  "upsert",
  "delete",
  "deleteMany",
]);

/** Raw dotazy, které můžou zapisovat. `$queryRaw` (čtení, GET_LOCK) projde. */
export const RAW_WRITE_OPERATIONS = new Set(["$executeRaw", "$executeRawUnsafe"]);

/** Živé tabulky s rokem, kam test zapisuje se stínovým rokem. */
export const SHADOW_YEAR_MODELS = new Set([
  "Split",
  "SplitEntry",
  "StartCheck",
  "StartCheckEntry",
  "FinishPunch",
  "FinishBib",
]);

export const TEST_MODELS = new Set(["TestModeRun", "TestModeStart", "TestModeOnsite"]);
export const ALWAYS_WRITABLE = new Set(["AuditLog", "AuditMeta"]);

/** Operace nad jedním záznamem podle jedinečného klíče (lze ověřit rok dohledáním). */
const SINGLE_RECORD = new Set(["update", "delete"]);

export type GateContext = { year: number; readOnly: boolean };
export type GateVerdict =
  { ok: true } | { ok: false; reason: string } | { ok: "lookup"; model: string; where: unknown };

type Obj = Record<string, unknown>;
const isObj = (value: unknown): value is Obj =>
  typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date);

/**
 * Roky v datech nebo podmínce: `year: n`, `year: { equals | in }` a o úroveň hlouběji
 * (složené klíče `year_bib: { year, bib }`). `null` = obsahuje rok, který nejde určit.
 */
export function yearsIn(value: unknown, depth = 0): number[] | null {
  if (!isObj(value)) return [];
  const years: number[] = [];
  if ("year" in value) {
    const y = value.year;
    if (typeof y === "number") years.push(y);
    else if (isObj(y) && typeof y.equals === "number" && Object.keys(y).length === 1) {
      years.push(y.equals);
    } else if (
      isObj(y) &&
      Array.isArray(y.in) &&
      Object.keys(y).length === 1 &&
      y.in.every((v) => typeof v === "number")
    ) {
      years.push(...(y.in as number[]));
    } else return null;
  }
  if (depth === 0) {
    for (const [key, nested] of Object.entries(value)) {
      if (key === "year" || !isObj(nested)) continue;
      if (key === "AND" || key === "OR" || key === "NOT") continue;
      const inner = yearsIn(nested, 1);
      if (inner === null) return null;
      years.push(...inner);
    }
  }
  return years;
}

function onlyYear(years: number[] | null, year: number): "ok" | "missing" | "foreign" {
  if (years === null) return "foreign";
  if (years.length === 0) return "missing";
  return years.every((y) => y === year) ? "ok" : "foreign";
}

export function testWriteVerdict(
  ctx: GateContext,
  model: string | undefined,
  operation: string,
  args: unknown,
): GateVerdict {
  if (!model) {
    return RAW_WRITE_OPERATIONS.has(operation)
      ? { ok: false, reason: `raw ${operation}` }
      : { ok: true };
  }
  if (!WRITE_OPERATIONS.has(operation)) return { ok: true };
  if (ctx.readOnly) return { ok: false, reason: `${model}.${operation}: test skončil` };
  if (TEST_MODELS.has(model) || ALWAYS_WRITABLE.has(model)) return { ok: true };
  if (!SHADOW_YEAR_MODELS.has(model)) {
    return { ok: false, reason: `${model}.${operation}: chráněná tabulka` };
  }
  if (!isShadowYear(ctx.year)) return { ok: false, reason: "kontext bez stínového roku" };
  const a = isObj(args) ? args : {};
  const checks: ("ok" | "missing" | "foreign")[] = [];
  if (operation === "create") checks.push(onlyYear(yearsIn(a.data), ctx.year));
  if (operation === "createMany" || operation === "createManyAndReturn") {
    const rows = Array.isArray(a.data) ? a.data : [a.data];
    if (rows.length === 0) checks.push("missing");
    for (const row of rows) checks.push(onlyYear(yearsIn(row), ctx.year));
  }
  if (operation === "upsert") {
    checks.push(onlyYear(yearsIn(a.where), ctx.year));
    checks.push(onlyYear(yearsIn(a.create), ctx.year));
  }
  if (
    operation === "update" ||
    operation === "updateMany" ||
    operation === "updateManyAndReturn" ||
    operation === "delete" ||
    operation === "deleteMany"
  ) {
    checks.push(onlyYear(yearsIn(a.where), ctx.year));
  }
  // Změna roku v datech update / upsert.update smí jen na stínový rok.
  for (const data of [a.data, a.update]) {
    if (operation === "create" || operation.startsWith("createMany")) break;
    const years = yearsIn(data);
    if (years === null || years.some((y) => y !== ctx.year)) {
      return { ok: false, reason: `${model}.${operation}: změna roku` };
    }
  }
  if (checks.includes("foreign")) {
    return { ok: false, reason: `${model}.${operation}: ostrý rok` };
  }
  if (checks.includes("missing")) {
    if (SINGLE_RECORD.has(operation) && isObj(a.where)) {
      return { ok: "lookup", model, where: a.where };
    }
    return { ok: false, reason: `${model}.${operation}: bez roku` };
  }
  return { ok: true };
}

/** Po dohledání záznamu podle jedinečného klíče: smí jen záznam stínového roku. */
export function lookupVerdict(ctx: GateContext, found: { year: number } | null): GateVerdict {
  if (!found) return { ok: true }; // nic k zápisu – Prisma sama vyhodí „nenalezeno“
  return found.year === ctx.year && isShadowYear(found.year)
    ? { ok: true }
    : { ok: false, reason: "záznam ostrého roku" };
}
