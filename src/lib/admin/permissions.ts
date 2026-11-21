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
  canAccessSplits,
  canAccessStarter,
  canManageSaleItems,
  canMarkSalePaidBank,
  canUseCashDesk,
  canViewSpeakerScreen,
  hasAdminHome,
  isStaffRole,
  type UserRole,
} from "@/lib/auth/roles";
import type { StaffRole } from "@/lib/auth/staff-roles";

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
  | "cashDesk"
  | "saleItems"
  | "bankPaid";

export const LEGACY_PREDICATES: Record<LegacyGuard, (role: UserRole) => boolean> = {
  home: hasAdminHome,
  staff: isStaffRole,
  admin: (role) => role === "admin",
  raceday: canAccessRaceDay,
  splits: canAccessSplits,
  starter: canAccessStarter,
  speaker: canViewSpeakerScreen,
  cashDesk: canUseCashDesk,
  saleItems: canManageSaleItems,
  bankPaid: canMarkSalePaidBank,
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
  "screens.starter": { read: "starter", write: "starter" },
  "screens.splits": { read: "splits", write: "splits" },
  "screens.speaker": { read: "speaker", write: "speaker" },
  "screens.resultboard": { read: "speaker", write: "speaker" },
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
  settings: { read: "admin", write: "admin" },
  audit: { read: "admin", write: "admin" },
} as const satisfies Record<string, Rule>;

export type SectionId = keyof typeof SECTION_RULES;
export const SECTION_IDS = Object.keys(SECTION_RULES) as SectionId[];

/** Sekce, které jsou vždy jen pro admina a v editoru oprávnění se nedají povolit jiné roli. */
export const SYSTEM_ONLY_SECTIONS: readonly SectionId[] = ["users", "settings"];

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
  },
  timing_ops: {
    overview: "write",
    "raceControl.overview": "write",
    "raceControl.start": "write",
    "raceControl.live": "write",
    "raceControl.resultboard": "write",
    "raceControl.testRun": "write",
    "raceControl.manual": "write",
    "screens.starter": "write",
    "screens.splits": "write",
    "screens.speaker": "read",
    "screens.resultboard": "read",
    "startlist.list": "read",
  },
  chief_referee: {
    overview: "write",
    "raceControl.overview": "read",
    "raceControl.start": "read",
    "raceControl.live": "read",
    "raceControl.manual": "read",
    "screens.speaker": "read",
    "screens.resultboard": "read",
    "startlist.list": "read",
    "entries.list": "read",
    afterRace: "write",
    audit: "read",
  },
  course_chief: {
    overview: "write",
    "raceControl.overview": "read",
    "raceControl.live": "read",
    "screens.splits": "read",
    "screens.speaker": "read",
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
export function v2HasAdminHome(grants: readonly StaffRole[], overrides?: Overrides): boolean {
  return grants.length > 0 && SECTION_IDS.some((id) => v2Allows(grants, id, "read", overrides));
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
