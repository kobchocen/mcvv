/**
 * Registr sekcí administrace (návrh administrace v2, P2): jediný zdroj pro levý panel,
 * mobilní seznam kapitol, tlačítko Zpět a drobečkovou navigaci.
 *
 * Struktura má nejvýš tři úrovně: skupina → kapitola → podkapitola (záložky uvnitř
 * podkapitoly řeší stránky samy, např. Kluby: Hledání · Sirotci · Slučování).
 * Obrazovky dne závodu (`external`) leží mimo /admin a otevírají se na celou obrazovku;
 * panel na ně jen odkazuje.
 *
 * Přístup se zatím řídí dnešními predikáty z `roles.ts` – registr jen říká, co se má
 * v navigaci ukázat. Skutečná ochrana zůstává ve stránkách a server actions
 * (`requireStaff`, `requireAdmin` …). Čisté funkce bez frameworku, testované.
 */
import {
  canAccessRaceDay,
  canAccessSplits,
  canAccessStarter,
  canManageSaleItems,
  canUseCashDesk,
  canViewSpeakerScreen,
  hasAdminHome,
  isStaffRole,
  type UserRole,
} from "@/lib/auth/roles";

/** Klíče překladů v namespace `AdminNav`. */
export type AdminNavLabel =
  | "overview"
  | "messages"
  | "entriesPayments"
  | "entries"
  | "specialStarts"
  | "payments"
  | "startlistBibs"
  | "startlist"
  | "printBibs"
  | "raceControl"
  | "raceDayOverview"
  | "start"
  | "liveResults"
  | "manualTimes"
  | "finish"
  | "finishStations"
  | "official"
  | "screens"
  | "starter"
  | "splits"
  | "speaker"
  | "resultboard"
  | "raceOffice"
  | "cashDesk"
  | "sales"
  | "saleItems"
  | "afterRace"
  | "newsletter"
  | "partners"
  | "editions"
  | "dictionaries"
  | "categories"
  | "clubs"
  | "runners"
  | "users"
  | "settings"
  | "permissions"
  | "audit";

export type AdminNavGroupLabel =
  "groupRace" | "groupRaceDay" | "groupContent" | "groupData" | "groupSystem";

/** Ikony (lucide) – mapuje je klientská komponenta panelu. */
export type AdminNavIcon =
  | "home"
  | "messages"
  | "entries"
  | "startlist"
  | "raceControl"
  | "screens"
  | "raceOffice"
  | "afterRace"
  | "newsletter"
  | "partners"
  | "editions"
  | "dictionaries"
  | "users"
  | "settings"
  | "permissions"
  | "audit";

/** Cesty, na které panel odkazuje (všechny jsou v `next-intl.config.ts` pathnames). */
export type AdminNavHref =
  | "/admin"
  | "/admin/zpravy"
  | "/admin/prihlasky"
  | "/admin/prihlasky/spec-starty"
  | "/admin/platby"
  | "/admin/startovka"
  | "/admin/tisk"
  | "/admin/den-zavodu"
  | "/admin/den-zavodu/start"
  | "/admin/den-zavodu/zive"
  | "/admin/den-zavodu/zive/casy"
  | "/admin/den-zavodu/zive/cil"
  | "/admin/den-zavodu/vysledky"
  | "/cil"
  | "/start"
  | "/mezicasy"
  | "/mezicasy/speaker"
  | "/resultboard"
  | "/kancelar"
  | "/kancelar/prodejky"
  | "/kancelar/polozky"
  | "/admin/po-zavode"
  | "/admin/newsletter"
  | "/admin/partneri"
  | "/admin/rocniky"
  | "/admin/ciselniky"
  | "/admin/ciselniky/kategorie"
  | "/admin/ciselniky/kluby"
  | "/admin/ciselniky/bezci"
  | "/admin/uzivatele"
  | "/admin/nastaveni"
  | "/admin/opravneni"
  | "/admin/audit";

export type AdminSubsection = {
  id: string;
  label: AdminNavLabel;
  href: AdminNavHref;
  /** Obrazovka mimo /admin (na celou obrazovku). */
  external?: boolean;
  allowed: (role: UserRole) => boolean;
};

export type AdminChapter = {
  id: string;
  label: AdminNavLabel;
  icon: AdminNavIcon;
  /** Stránka kapitoly; u kapitol s podkapitolami rozcestník nebo první podkapitola. */
  href?: AdminNavHref;
  external?: boolean;
  allowed?: (role: UserRole) => boolean;
  /** Odznak s počtem (dopočítá layout). */
  badge?: "unreadMessages";
  children?: AdminSubsection[];
};

export type AdminGroup = { id: string; label: AdminNavGroupLabel; chapters: AdminChapter[] };

const isAdmin = (role: UserRole) => role === "admin";

export const ADMIN_SECTIONS: readonly AdminGroup[] = [
  {
    id: "race",
    label: "groupRace",
    chapters: [
      { id: "overview", label: "overview", icon: "home", href: "/admin", allowed: hasAdminHome },
      {
        id: "messages",
        label: "messages",
        icon: "messages",
        href: "/admin/zpravy",
        allowed: isStaffRole,
        badge: "unreadMessages",
      },
      {
        id: "entries",
        label: "entriesPayments",
        icon: "entries",
        children: [
          { id: "entries.list", label: "entries", href: "/admin/prihlasky", allowed: isStaffRole },
          {
            id: "entries.special",
            label: "specialStarts",
            href: "/admin/prihlasky/spec-starty",
            allowed: isStaffRole,
          },
          {
            id: "entries.payments",
            label: "payments",
            href: "/admin/platby",
            allowed: isStaffRole,
          },
        ],
      },
      {
        id: "startlist",
        label: "startlistBibs",
        icon: "startlist",
        children: [
          {
            id: "startlist.list",
            label: "startlist",
            href: "/admin/startovka",
            allowed: isStaffRole,
          },
          { id: "startlist.print", label: "printBibs", href: "/admin/tisk", allowed: isStaffRole },
        ],
      },
    ],
  },
  {
    id: "raceday",
    label: "groupRaceDay",
    chapters: [
      {
        id: "raceControl",
        label: "raceControl",
        icon: "raceControl",
        children: [
          {
            id: "raceControl.overview",
            label: "raceDayOverview",
            href: "/admin/den-zavodu",
            allowed: canAccessRaceDay,
          },
          {
            id: "raceControl.start",
            label: "start",
            href: "/admin/den-zavodu/start",
            allowed: isStaffRole,
          },
          {
            id: "raceControl.live",
            label: "liveResults",
            href: "/admin/den-zavodu/zive",
            allowed: isStaffRole,
          },
          {
            id: "raceControl.manual",
            label: "manualTimes",
            href: "/admin/den-zavodu/zive/casy",
            allowed: isAdmin,
          },
          {
            id: "raceControl.finish",
            label: "finish",
            href: "/admin/den-zavodu/zive/cil",
            allowed: canAccessRaceDay,
          },
          {
            id: "raceControl.official",
            label: "official",
            href: "/admin/den-zavodu/vysledky",
            allowed: canAccessRaceDay,
          },
        ],
      },
      {
        id: "screens",
        label: "screens",
        icon: "screens",
        children: [
          {
            id: "screens.starter",
            label: "starter",
            href: "/start",
            external: true,
            allowed: canAccessStarter,
          },
          {
            id: "screens.splits",
            label: "splits",
            href: "/mezicasy",
            external: true,
            allowed: canAccessSplits,
          },
          {
            id: "screens.finish",
            label: "finishStations",
            href: "/cil",
            external: true,
            allowed: canAccessRaceDay,
          },
          {
            id: "screens.speaker",
            label: "speaker",
            href: "/mezicasy/speaker",
            external: true,
            allowed: canViewSpeakerScreen,
          },
          {
            id: "screens.resultboard",
            label: "resultboard",
            href: "/resultboard",
            external: true,
            allowed: canViewSpeakerScreen,
          },
        ],
      },
      {
        id: "raceOffice",
        label: "raceOffice",
        icon: "raceOffice",
        children: [
          {
            id: "raceOffice.cash",
            label: "cashDesk",
            href: "/kancelar",
            external: true,
            allowed: canUseCashDesk,
          },
          {
            id: "raceOffice.sales",
            label: "sales",
            href: "/kancelar/prodejky",
            external: true,
            allowed: canUseCashDesk,
          },
          {
            id: "raceOffice.items",
            label: "saleItems",
            href: "/kancelar/polozky",
            external: true,
            allowed: canManageSaleItems,
          },
        ],
      },
      {
        id: "afterRace",
        label: "afterRace",
        icon: "afterRace",
        href: "/admin/po-zavode",
        allowed: isStaffRole,
      },
    ],
  },
  {
    id: "content",
    label: "groupContent",
    chapters: [
      {
        id: "newsletter",
        label: "newsletter",
        icon: "newsletter",
        href: "/admin/newsletter",
        allowed: isStaffRole,
      },
      {
        id: "partners",
        label: "partners",
        icon: "partners",
        href: "/admin/partneri",
        allowed: isStaffRole,
      },
    ],
  },
  {
    id: "data",
    label: "groupData",
    chapters: [
      {
        id: "editions",
        label: "editions",
        icon: "editions",
        href: "/admin/rocniky",
        allowed: isStaffRole,
      },
      {
        id: "dictionaries",
        label: "dictionaries",
        icon: "dictionaries",
        href: "/admin/ciselniky",
        allowed: isStaffRole,
        children: [
          {
            id: "dictionaries.categories",
            label: "categories",
            href: "/admin/ciselniky/kategorie",
            allowed: isStaffRole,
          },
          {
            id: "dictionaries.clubs",
            label: "clubs",
            href: "/admin/ciselniky/kluby",
            allowed: isStaffRole,
          },
          {
            id: "dictionaries.runners",
            label: "runners",
            href: "/admin/ciselniky/bezci",
            allowed: isAdmin,
          },
        ],
      },
    ],
  },
  {
    id: "system",
    label: "groupSystem",
    chapters: [
      { id: "users", label: "users", icon: "users", href: "/admin/uzivatele", allowed: isAdmin },
      {
        id: "settings",
        label: "settings",
        icon: "settings",
        href: "/admin/nastaveni",
        allowed: isAdmin,
      },
      {
        id: "permissions",
        label: "permissions",
        icon: "permissions",
        href: "/admin/opravneni",
        allowed: isAdmin,
      },
      { id: "audit", label: "audit", icon: "audit", href: "/admin/audit", allowed: isAdmin },
    ],
  },
];

/** Navigace viditelná pro roli: jen povolené položky, prázdné kapitoly a skupiny zmizí. */
export function visibleSections(role: UserRole): AdminGroup[] {
  return visibleSectionsBy((item) => item.allowed?.(role) ?? false);
}

/**
 * Navigace podle libovolného „smí číst“ (P4: engine oprávnění při zapnutém `permissions.v2`).
 * Kapitola bez vlastní stránky (bez `href`) se ukáže jen kvůli povoleným podkapitolám.
 */
export function visibleSectionsBy(
  canRead: (item: { id: string; allowed?: (role: UserRole) => boolean }) => boolean,
): AdminGroup[] {
  const groups: AdminGroup[] = [];
  for (const group of ADMIN_SECTIONS) {
    const chapters: AdminChapter[] = [];
    for (const chapter of group.chapters) {
      const children = chapter.children?.filter((child) => canRead(child));
      const ownPage = chapter.href !== undefined && canRead(chapter);
      if (!ownPage && !children?.length) continue;
      chapters.push({
        ...chapter,
        href: ownPage ? chapter.href : children?.[0]?.href,
        children: children?.length ? children : undefined,
      });
    }
    if (chapters.length) groups.push({ ...group, chapters });
  }
  return groups;
}

/** Cesta bez locale a bez query, bez koncového lomítka. */
function normalize(path: string): string {
  const bare = path.split(/[?#]/)[0] ?? "";
  return bare.replace(/\/$/, "") || "/";
}

function covers(href: string, path: string): boolean {
  if (href === "/admin") return path === "/admin";
  return path === href || path.startsWith(`${href}/`);
}

/** Minimální tvar navigace pro hledání polohy (registr i serializovaný strom pro klienta). */
type LocatableItem = { id: string; href?: string };
type LocatableChapter = LocatableItem & {
  children?: readonly (LocatableItem & { href: string })[];
};
type LocatableGroup = { id: string; chapters: readonly LocatableChapter[] };

export type AdminLocation = {
  groupId: string;
  chapterId: string;
  chapterHref?: string;
  subsectionId?: string;
  subsectionHref?: string;
  /** Cesta je hlubší než nalezená položka (detail záznamu, nový záznam, záložka). */
  deeper: boolean;
};

/** Kde v navigaci leží cesta (nejdelší shoda), nebo null. */
export function locate(
  path: string,
  groups: readonly LocatableGroup[] = ADMIN_SECTIONS,
): AdminLocation | null {
  const target = normalize(path);
  let best: AdminLocation | null = null;
  let bestLength = -1;
  for (const group of groups) {
    for (const chapter of group.chapters) {
      const candidates: { href: string; sub?: LocatableItem & { href: string } }[] = [];
      if (chapter.href) candidates.push({ href: chapter.href });
      for (const child of chapter.children ?? []) candidates.push({ href: child.href, sub: child });
      for (const candidate of candidates) {
        if (!covers(candidate.href, target) || candidate.href.length <= bestLength) continue;
        bestLength = candidate.href.length;
        best = {
          groupId: group.id,
          chapterId: chapter.id,
          chapterHref: chapter.href,
          subsectionId: candidate.sub?.id,
          subsectionHref: candidate.sub?.href,
          deeper: target !== candidate.href,
        };
      }
    }
  }
  return best;
}

/**
 * Kam vede mobilní „‹ Zpět“: z detailu na jeho seznam, z podkapitoly na rozcestník
 * kapitoly (má-li vlastní stránku), jinak na seznam kapitol `/admin`. Na `/admin` null.
 */
export function backHref(
  path: string,
  groups: readonly LocatableGroup[] = ADMIN_SECTIONS,
): string | null {
  const target = normalize(path);
  if (target === "/admin") return null;
  const location = locate(target, groups);
  if (!location) return "/admin";
  if (location.deeper) return location.subsectionHref ?? location.chapterHref ?? "/admin";
  if (
    location.subsectionHref &&
    location.chapterHref &&
    location.chapterHref !== location.subsectionHref
  ) {
    return location.chapterHref;
  }
  return "/admin";
}

/** Serializovatelný strom navigace pro klientskou komponentu (bez funkcí, s přeloženými názvy). */
export type AdminNavItem = {
  id: string;
  label: string;
  href: string;
  external?: boolean;
  icon?: AdminNavIcon;
  badge?: number;
  children?: AdminNavItem[];
};
export type AdminNavGroup = { id: string; label: string; chapters: AdminNavItem[] };

export function navTree(
  groups: readonly AdminGroup[],
  t: (key: AdminNavLabel | AdminNavGroupLabel) => string,
  badges: Partial<Record<NonNullable<AdminChapter["badge"]>, number>> = {},
): AdminNavGroup[] {
  return groups.map((group) => ({
    id: group.id,
    label: t(group.label),
    chapters: group.chapters
      .filter((chapter) => chapter.href)
      .map((chapter) => ({
        id: chapter.id,
        label: t(chapter.label),
        href: chapter.href!,
        external: chapter.external,
        icon: chapter.icon,
        badge: chapter.badge ? badges[chapter.badge] : undefined,
        children: chapter.children?.map((child) => ({
          id: child.id,
          label: t(child.label),
          href: child.href,
          external: child.external,
        })),
      })),
  }));
}
