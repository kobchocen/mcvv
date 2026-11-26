/**
 * Oprávnění administrace po sekcích – čtení / úpravy (návrh administrace v2, P4).
 *
 * Každá sekce má:
 * - `legacy` – dnešní kontrolu pro čtení a pro úpravy (platí při vypnutém nastavení
 *   `permissions.v2`; `requireSection` pak volá přesně dnešní stráž, chování se nemění),
 * - výchozí úroveň pro každou roli nového modelu (platí při zapnutém flagu, admin má
 *   vždy vše; odchylky z `mcvv_role_section` mají přednost).
 *
 * Výchozí úrovně rolí převedených ze starého sloupce (`organizer_legacy`, `splitmaker`,
 * `starter`, `race_office`) se odvozují z `legacy` – test ekvivalence hlídá, že po převodu
 * nikdo nezíská ani neztratí přístup. Čisté funkce bez frameworku a DB.
 */
import {
  canAccessRaceDay,
  canAccessScreens,
  canAccessSplits,
  canAccessStarter,
  canManageSaleItems,
  canMarkSalePaidBank,
  canUseCashDesk,
  canViewResultboardScreen,
  canViewSpeakerScreen,
  hasAdminHome,
  isStaffRole,
  type UserRole,
} from "@/lib/auth/roles";
import { STAFF_ROLES, type StaffRole } from "@/lib/auth/staff-roles";

export type AccessLevel = "read" | "write";
export type StoredLevel = "none" | AccessLevel;

/** Dnešní stráže. `staff` / `admin` / `raceday` = `requireStaff` / `requireAdmin` / `requireRaceDay`. */
export type LegacyGuard =
  | "home"
  | "staff"
  | "admin"
  | "raceday"
  | "splits"
  | "starter"
  | "speaker"
  | "resultboard"
  | "cashDesk"
  | "saleItems"
  | "bankPaid"
  | "screens";

export const LEGACY_PREDICATES: Record<LegacyGuard, (role: UserRole) => boolean> = {
  home: hasAdminHome,
  staff: isStaffRole,
  admin: (role) => role === "admin",
  raceday: canAccessRaceDay,
  splits: canAccessSplits,
  starter: canAccessStarter,
  speaker: canViewSpeakerScreen,
  resultboard: canViewResultboardScreen,
  cashDesk: canUseCashDesk,
  saleItems: canManageSaleItems,
  bankPaid: canMarkSalePaidBank,
  screens: canAccessScreens,
};

type Rule = { read: LegacyGuard; write: LegacyGuard };

/** Sekce oprávnění (podkapitoly registru + jemnější části stránek). */
export const SECTION_RULES = {
  overview: { read: "home", write: "home" },
  messages: { read: "staff", write: "staff" },
  "entries.list": { read: "staff", write: "staff" },
  "entries.special": { read: "staff", write: "staff" },
  "entries.payments": { read: "staff", write: "staff" },
  "startlist.list": { read: "staff", write: "staff" },
  "startlist.print": { read: "staff", write: "staff" },
  "raceControl.overview": { read: "raceday", write: "raceday" },
  "raceControl.start": { read: "staff", write: "admin" },
  "raceControl.live": { read: "staff", write: "admin" },
  "raceControl.resultboard": { read: "staff", write: "staff" },
  "raceControl.testRun": { read: "admin", write: "admin" },
  "raceControl.manual": { read: "admin", write: "admin" },
  /** Cíl (#252): párování stopek a čísel a jeho opravy (Měření, řízení závodu). */
  "raceControl.finish": { read: "raceday", write: "raceday" },
  /** Oficiální výsledky (#337): náhled a zveřejnění (Měření / hlavní rozhodčí, dnes admin). */
  "raceControl.official": { read: "raceday", write: "admin" },
  /** Kontrola výsledků hlavním rozhodčím před zveřejněním (dnes admin). */
  "raceControl.officialCheck": { read: "raceday", write: "admin" },
  /** Přehled trati pro šéfa trati (#316): průchody kontrolami, vynechané kontroly. */
  "raceControl.course": { read: "raceday", write: "raceday" },
  screens: { read: "screens", write: "screens" },
  "screens.starter": { read: "starter", write: "starter" },
  "screens.splits": { read: "splits", write: "splits" },
  /** Cíl (#252): stanice Stopky a Čísla. */
  "screens.finish": { read: "raceday", write: "raceday" },
  "screens.speaker": { read: "speaker", write: "speaker" },
  "screens.resultboard": { read: "resultboard", write: "speaker" },
  raceOffice: { read: "cashDesk", write: "cashDesk" },
  "raceOffice.cash": { read: "cashDesk", write: "cashDesk" },
  "raceOffice.sales": { read: "cashDesk", write: "cashDesk" },
  "raceOffice.bankPaid": { read: "bankPaid", write: "bankPaid" },
  "raceOffice.items": { read: "saleItems", write: "saleItems" },
  afterRace: { read: "staff", write: "staff" },
  newsletter: { read: "staff", write: "staff" },
  partners: { read: "staff", write: "staff" },
  editions: { read: "staff", write: "staff" },
  dictionaries: { read: "staff", write: "staff" },
  "dictionaries.categories": { read: "staff", write: "staff" },
  "dictionaries.clubs": { read: "staff", write: "staff" },
  "dictionaries.clubs.merge": { read: "staff", write: "admin" },
  "dictionaries.clubs.orphans": { read: "admin", write: "admin" },
  "dictionaries.runners": { read: "admin", write: "admin" },
  "dictionaries.runners.merge": { read: "admin", write: "admin" },
  users: { read: "admin", write: "admin" },
  permissions: { read: "admin", write: "admin" },
  settings: { read: "admin", write: "admin" },
  audit: { read: "admin", write: "admin" },
} as const satisfies Record<string, Rule>;

export type SectionId = keyof typeof SECTION_RULES;
export const SECTION_IDS = Object.keys(SECTION_RULES) as SectionId[];

/** Sekce, které jsou vždy jen pro admina a v editoru oprávnění se nedají povolit jiné roli. */
export const SYSTEM_ONLY_SECTIONS: readonly SectionId[] = ["users", "settings", "permissions"];

export function isSectionId(value: unknown): value is SectionId {
  return typeof value === "string" && Object.hasOwn(SECTION_RULES, value);
}

/** Dnešní (legacy) přístup role k sekci. */
export function legacyAllows(role: UserRole, id: SectionId, level: AccessLevel): boolean {
  return LEGACY_PREDICATES[SECTION_RULES[id][level]](role);
}

export function legacyGuard(id: SectionId, level: AccessLevel): LegacyGuard {
  return SECTION_RULES[id][level];
}

/** Role nového modelu, jejichž výchozí práva se odvozují ze staré role (beze změny přístupu). */
const DERIVED_FROM_LEGACY: Partial<Record<StaffRole, UserRole>> = {
  organizer_legacy: "organizer",
  splitmaker: "splitmaker",
  starter: "starter",
  race_office: "race_office",
  resultboard: "resultboard",
};

type Matrix = Partial<Record<SectionId, AccessLevel>>;

/** Výchozí matice nových rolí (návrh v2, příloha B). */
const NEW_ROLE_DEFAULTS: Partial<Record<StaffRole, Matrix>> = {
  entries: {
    overview: "write",
    messages: "write",
    "entries.list": "write",
    "entries.special": "write",
    "entries.payments": "write",
    "startlist.list": "read",
    editions: "read",
    dictionaries: "read",
    "dictionaries.categories": "read",
    "dictionaries.runners": "read",
    "raceOffice.cash": "read",
    "raceOffice.sales": "read",
    raceOffice: "read",
  },
  startlist: {
    overview: "write",
    "startlist.list": "write",
    "startlist.print": "write",
    "entries.special": "write",
    "entries.list": "read",
    "entries.payments": "read",
    dictionaries: "read",
    "dictionaries.categories": "read",
  },
  comms: { overview: "write", messages: "write", newsletter: "write", "entries.list": "read" },
  content: { overview: "write", partners: "write", afterRace: "write" },
  data: {
    overview: "write",
    editions: "write",
    dictionaries: "write",
    "dictionaries.categories": "write",
    "dictionaries.clubs": "write",
    "dictionaries.clubs.merge": "read",
    "dictionaries.clubs.orphans": "read",
    "dictionaries.runners": "write",
    "dictionaries.runners.merge": "read",
  },
  speaker: {
    overview: "write",
    "raceControl.overview": "read",
    "raceControl.resultboard": "write",
    "screens.speaker": "read",
    "screens.resultboard": "read",
    screens: "read",
  },
  timing_ops: {
    overview: "write",
    "raceControl.overview": "write",
    "raceControl.start": "write",
    "raceControl.live": "write",
    "raceControl.resultboard": "write",
    "raceControl.testRun": "write",
    "raceControl.manual": "write",
    "raceControl.finish": "write",
    "raceControl.official": "write",
    "raceControl.officialCheck": "read",
    "raceControl.course": "write",
    "screens.starter": "write",
    "screens.finish": "write",
    "screens.splits": "write",
    "screens.speaker": "read",
    "screens.resultboard": "read",
    "startlist.list": "read",
    screens: "write",
  },
  chief_referee: {
    overview: "write",
    "raceControl.overview": "read",
    "raceControl.start": "read",
    "raceControl.live": "read",
    "raceControl.manual": "read",
    "raceControl.finish": "read",
    "raceControl.official": "write",
    "raceControl.officialCheck": "write",
    "raceControl.course": "read",
    "screens.speaker": "read",
    "screens.resultboard": "read",
    screens: "read",
    "startlist.list": "read",
    "entries.list": "read",
    afterRace: "write",
    audit: "read",
  },
  course_chief: {
    overview: "write",
    "raceControl.overview": "read",
    "raceControl.course": "read",
    "raceControl.live": "read",
    "screens.splits": "read",
    "screens.speaker": "read",
    screens: "read",
  },
};

/** Výchozí úroveň role v sekci (bez odchylek z DB). Admin má vždy úpravy. */
export function defaultLevel(role: StaffRole, id: SectionId): StoredLevel {
  if (role === "admin") return "write";
  const legacy = DERIVED_FROM_LEGACY[role];
  if (legacy) {
    if (legacyAllows(legacy, id, "write")) return "write";
    if (legacyAllows(legacy, id, "read")) return "read";
    return "none";
  }
  return NEW_ROLE_DEFAULTS[role]?.[id] ?? "none";
}

/** Odchylky z `mcvv_role_section`: role → sekce → úroveň. */
export type Overrides = ReadonlyMap<string, StoredLevel>;

export function overrideKey(role: string, id: string): string {
  return `${role}\u0000${id}`;
}

const RANK: Record<StoredLevel, number> = { none: 0, read: 1, write: 2 };

/** Výsledná úroveň účtu s danými rolemi: maximum přes role, admin vždy úpravy. */
export function levelFor(
  grants: readonly StaffRole[],
  id: SectionId,
  overrides: Overrides = new Map(),
): StoredLevel {
  let best: StoredLevel = "none";
  for (const role of grants) {
    if (role === "admin") return "write";
    const stored = SYSTEM_ONLY_SECTIONS.includes(id)
      ? undefined
      : overrides.get(overrideKey(role, id));
    const level = stored ?? defaultLevel(role, id);
    if (RANK[level] > RANK[best]) best = level;
  }
  return best;
}

/** Splňuje úroveň požadavek? (úpravy zahrnují čtení) */
export function satisfies(level: StoredLevel, wanted: AccessLevel): boolean {
  return RANK[level] >= RANK[wanted];
}

export function v2Allows(
  grants: readonly StaffRole[],
  id: SectionId,
  wanted: AccessLevel,
  overrides?: Overrides,
): boolean {
  return satisfies(levelFor(grants, id, overrides), wanted);
}

/** Má účet nějakou sekci (= kolečko a /admin)? */
/** Kolečko a rozcestník `/admin`: právo číst přehled, ne jen kioskovou obrazovku. */
export function v2HasAdminHome(grants: readonly StaffRole[], overrides?: Overrides): boolean {
  return v2Allows(grants, "overview", "read", overrides);
}

type Allows = (id: SectionId, level: AccessLevel) => boolean;

/** Rozsah zápisu mezičasů: všechna stanoviště (řízení závodu), nebo jen přiřazená. */
export function splitScope(allows: Allows): { all: boolean; own: boolean } {
  return { all: allows("raceControl.live", "read"), own: allows("screens.splits", "write") };
}

/** Rozsah obrazovky startéra: libovolný koridor (řízení startu), nebo jen přiřazený. */
export function starterScope(allows: Allows): { any: boolean; own: boolean } {
  return { any: allows("raceControl.start", "read"), own: allows("screens.starter", "read") };
}

// ---------------------------------------------------------------------------
// Editor oprávnění (P8): úpravy matice rolí × sekcí v `mcvv_role_section`.

/** Role, jejichž práva jdou upravit (admin má vždy úpravy). */
export const EDITABLE_ROLES: readonly StaffRole[] = STAFF_ROLES.filter((role) => role !== "admin");

/** Sekce v editoru: bez přehledu (rozcestník) a bez sekcí jen pro admina. */
export const EDITABLE_SECTIONS: readonly SectionId[] = SECTION_IDS.filter(
  (id) => id !== "overview" && !SYSTEM_ONLY_SECTIONS.includes(id),
);

const STORED_LEVELS: readonly StoredLevel[] = ["none", "read", "write"];

/** Platná úroveň buňky: odchylka z DB, jinak výchozí. */
export function effectiveCell(role: StaffRole, id: SectionId, overrides: Overrides): StoredLevel {
  return overrides.get(overrideKey(role, id)) ?? defaultLevel(role, id);
}

/** Název pole formuláře editoru pro buňku. */
export function matrixField(role: StaffRole, id: SectionId): string {
  return `m|${role}|${id}`;
}

/** Odeslaný formulář editoru → buňky (klíč `overrideKey`); neplatné položky se zahodí. */
export function parseMatrixForm(entries: Iterable<[string, unknown]>): Map<string, StoredLevel> {
  const out = new Map<string, StoredLevel>();
  for (const [name, value] of entries) {
    const [prefix, role, id, extra] = name.split("|");
    if (prefix !== "m" || extra !== undefined) continue;
    if (!EDITABLE_ROLES.includes(role as StaffRole)) continue;
    if (!isSectionId(id) || !EDITABLE_SECTIONS.includes(id)) continue;
    if (!STORED_LEVELS.includes(value as StoredLevel)) continue;
    out.set(overrideKey(role!, id), value as StoredLevel);
  }
  return out;
}

export type MatrixPlan = {
  upserts: { role: StaffRole; sectionId: SectionId; level: StoredLevel }[];
  deletes: { role: StaffRole; sectionId: SectionId }[];
  /** `role/sekce` → platná úroveň před a po (pro audit `permissions.changed`). */
  changes: Record<string, { before: StoredLevel; after: StoredLevel }>;
};

/**
 * Co zapsat: do DB jen odchylky od výchozí matice (hodnota rovná výchozí = řádek smazat).
 * Buňky, které formulář neposlal, se nemění.
 */
export function planMatrixChange(
  overrides: Overrides,
  submitted: ReadonlyMap<string, StoredLevel>,
): MatrixPlan {
  const plan: MatrixPlan = { upserts: [], deletes: [], changes: {} };
  for (const role of EDITABLE_ROLES) {
    for (const sectionId of EDITABLE_SECTIONS) {
      const key = overrideKey(role, sectionId);
      const next = submitted.get(key);
      if (next === undefined) continue;
      const stored = overrides.get(key);
      const before = stored ?? defaultLevel(role, sectionId);
      if (next === defaultLevel(role, sectionId)) {
        if (stored !== undefined) plan.deletes.push({ role, sectionId });
      } else if (stored !== next) {
        plan.upserts.push({ role, sectionId, level: next });
      }
      if (before !== next) plan.changes[`${role}/${sectionId}`] = { before, after: next };
    }
  }
  return plan;
}

/** Návrat k výchozí matici: změny pro audit `permissions.reset`. */
export function resetChanges(overrides: Overrides): MatrixPlan["changes"] {
  const changes: MatrixPlan["changes"] = {};
  for (const role of EDITABLE_ROLES) {
    for (const sectionId of EDITABLE_SECTIONS) {
      const stored = overrides.get(overrideKey(role, sectionId));
      const fallback = defaultLevel(role, sectionId);
      if (stored !== undefined && stored !== fallback) {
        changes[`${role}/${sectionId}`] = { before: stored, after: fallback };
      }
    }
  }
  return changes;
}
