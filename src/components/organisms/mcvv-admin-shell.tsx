"use client";

import { useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Flag,
  Gift,
  Handshake,
  House,
  ListOrdered,
  Mail,
  MessageSquare,
  MonitorPlay,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
  Star,
  Store,
  Users,
  type LucideIcon,
} from "lucide-react";

import { Link } from "@/i18n/routing";
import {
  backHref,
  locate,
  type AdminNavGroup,
  type AdminNavHref,
  type AdminNavIcon,
  type AdminNavItem,
} from "@/lib/admin/sections";
import { cn } from "@/lib/utils";

const ICONS: Record<AdminNavIcon, LucideIcon> = {
  home: House,
  messages: MessageSquare,
  entries: ClipboardList,
  startlist: ListOrdered,
  raceControl: Flag,
  screens: MonitorPlay,
  raceOffice: Store,
  afterRace: Gift,
  newsletter: Mail,
  partners: Handshake,
  editions: CalendarDays,
  dictionaries: BookOpen,
  users: Users,
  settings: Settings,
  permissions: ShieldCheck,
  audit: ScrollText,
};

export type McvvAdminShellCopy = {
  home: string;
  navLabel: string;
  search: string;
  noResults: string;
  back: string;
  breadcrumb: string;
  detail: string;
  external: string;
  /** Připnuté (P6) – jen když panel dostane `pins`. */
  pinned?: string;
  pinEdit?: string;
  pinDone?: string;
  pin?: string;
  unpin?: string;
};

export type McvvAdminPins = {
  /** Id připnutých sekcí v pořadí. */
  ids: string[];
  /** Server action: připnout / odepnout `sectionId`. */
  toggle: (formData: FormData) => Promise<void>;
};

function PinButton({
  id,
  pinned,
  pins,
  copy,
}: {
  id: string;
  pinned: boolean;
  pins: McvvAdminPins;
  copy: McvvAdminShellCopy;
}) {
  return (
    <form action={pins.toggle} className="flex shrink-0 items-center">
      <input type="hidden" name="sectionId" value={id} />
      <button
        type="submit"
        aria-label={pinned ? copy.unpin : copy.pin}
        title={pinned ? copy.unpin : copy.pin}
        className="flex size-10 items-center justify-center text-race-accent"
        data-testid={`admin-pin-${id}`}
      >
        <Star className={cn("size-4", pinned && "fill-current")} aria-hidden="true" />
      </button>
    </form>
  );
}

function stripLocale(pathname: string): string {
  return pathname.replace(/^\/(cs|en|de|pl|uk)(?=\/|$)/, "") || "/";
}

function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/** Položky odpovídající hledání (kapitola zůstane, když sedí ona nebo některá podkapitola). */
function filterTree(groups: AdminNavGroup[], query: string): AdminNavGroup[] {
  const needle = fold(query.trim());
  if (!needle) return groups;
  return groups
    .map((group) => ({
      ...group,
      chapters: group.chapters
        .map((chapter): AdminNavItem | null => {
          const own = fold(chapter.label).includes(needle);
          const children = chapter.children?.filter((child) => fold(child.label).includes(needle));
          if (!own && !children?.length) return null;
          return { ...chapter, children: own ? chapter.children : children };
        })
        .filter((chapter): chapter is AdminNavItem => chapter !== null),
    }))
    .filter((group) => group.chapters.length > 0);
}

function NavLink({
  item,
  active,
  external,
  className,
  children,
}: {
  item: AdminNavItem;
  active: boolean;
  external: string;
  className: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={item.href as AdminNavHref}
      aria-current={active ? "page" : undefined}
      title={item.external ? external : undefined}
      className={className}
    >
      {children}
      {item.external ? (
        <span aria-label={external} className="ml-auto text-xs text-race-muted">
          ↗
        </span>
      ) : null}
    </Link>
  );
}

/**
 * Rozvržení administrace ve stylu iPhone Nastavení (návrh v2, P2).
 * - Desktop (lg+): vlevo panel skupin a kapitol, aktivní kapitola rozbalí podkapitoly;
 *   nad obsahem drobečková navigace.
 * - Mobil: `/admin` je seznam kapitol (všechny podkapitoly rozbalené), ostatní stránky
 *   mají nahoře „‹ Zpět“ o úroveň výš podle registru sekcí (ne podle historie).
 * - Obrazovky dne závodu jsou jen odkazy (↗) – otevřou se na celou obrazovku mimo panel.
 */
export function McvvAdminShell({
  groups,
  copy,
  pins,
  children,
}: {
  groups: AdminNavGroup[];
  copy: McvvAdminShellCopy;
  /** Připnuté položky (P6, jen při zapnutém `permissions.v2`); bez nich panel jako dřív. */
  pins?: McvvAdminPins;
  children: ReactNode;
}) {
  const [editPins, setEditPins] = useState(false);
  const allItems = useMemo(
    () =>
      groups.flatMap((group) =>
        group.chapters.flatMap((chapter) => [chapter, ...(chapter.children ?? [])]),
      ),
    [groups],
  );
  const pinnedItems = useMemo(
    () =>
      (pins?.ids ?? [])
        .map((id) => allItems.find((item) => item.id === id))
        .filter((item): item is AdminNavItem => item !== undefined),
    [pins, allItems],
  );
  /** V režimu úprav přidá před řádek hvězdičku; jinak řádek beze změny. */
  const withPin = (id: string, row: ReactNode): ReactNode =>
    pins && editPins ? (
      <div className="flex items-stretch">
        <PinButton id={id} pinned={pins.ids.includes(id)} pins={pins} copy={copy} />
        <div className="min-w-0 flex-1">{row}</div>
      </div>
    ) : (
      row
    );
  const path = stripLocale(usePathname() ?? "/admin");
  const [query, setQuery] = useState("");
  const isIndex = path === "/admin" || path === "/admin/";
  const location = useMemo(() => locate(path, groups), [path, groups]);
  const back = backHref(path, groups);
  const shown = useMemo(() => filterTree(groups, query), [groups, query]);

  const labelOf = (href: string | null): string => {
    if (!href || href === "/admin") return copy.home;
    for (const group of groups) {
      for (const chapter of group.chapters) {
        if (chapter.href === href) return chapter.label;
        const child = chapter.children?.find((item) => item.href === href);
        if (child) return child.label;
      }
    }
    return copy.home;
  };

  const chapter = location
    ? groups.flatMap((group) => group.chapters).find((item) => item.id === location.chapterId)
    : undefined;
  const subsection = chapter?.children?.find((item) => item.id === location?.subsectionId);
  const crumbs: { label: string; href?: string }[] = [{ label: copy.home, href: "/admin" }];
  if (chapter && chapter.href !== "/admin")
    crumbs.push({ label: chapter.label, href: chapter.href });
  if (subsection) crumbs.push({ label: subsection.label, href: subsection.href });
  if (location?.deeper) crumbs.push({ label: copy.detail });
  // Poslední drobeček je aktuální stránka (bez odkazu).
  const trail = crumbs.map((crumb, index) =>
    index === crumbs.length - 1 ? { label: crumb.label } : crumb,
  );

  return (
    <div
      className="mx-auto flex w-full max-w-[1600px] flex-col lg:flex-row"
      data-testid="admin-shell"
    >
      <aside
        className={cn(
          "border-race-line/55 lg:sticky lg:top-0 lg:block lg:h-screen lg:w-72 lg:shrink-0 lg:overflow-y-auto lg:border-r",
          isIndex ? "block w-full" : "hidden",
        )}
        data-testid="admin-nav"
      >
        <nav aria-label={copy.navLabel} className="px-4 py-6 lg:px-3">
          <label className="relative mb-5 block">
            <span className="sr-only">{copy.search}</span>
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-race-muted"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={copy.search}
              className="h-10 w-full rounded-[10px] border border-race-line/60 bg-race-surface pl-9 pr-3 text-sm text-foreground placeholder:text-race-muted focus:border-race-accent focus:outline-none"
              data-testid="admin-nav-search"
            />
          </label>
          {pins && !query.trim() ? (
            <section className="mb-5" data-testid="admin-pinned">
              <div className="flex items-center justify-between px-2 pb-1.5">
                <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-race-muted">
                  {copy.pinned}
                </h2>
                <button
                  type="button"
                  onClick={() => setEditPins((value) => !value)}
                  className="text-xs font-semibold text-race-accent"
                  data-testid="admin-pin-edit"
                >
                  {editPins ? copy.pinDone : copy.pinEdit}
                </button>
              </div>
              {pinnedItems.length ? (
                <ul className="overflow-hidden rounded-[12px] border border-race-line/45 bg-race-surface">
                  {pinnedItems.map((item) => (
                    <li key={item.id} className="border-b border-race-line/35 last:border-b-0">
                      {withPin(
                        item.id,
                        <NavLink
                          item={item}
                          active={path === item.href}
                          external={copy.external}
                          className="flex min-h-11 items-center gap-3 px-3 py-2 text-[15px] text-foreground/90 transition-colors hover:bg-race-accent/10"
                        >
                          <Star className="size-4 shrink-0 text-race-accent" aria-hidden="true" />
                          <span className="min-w-0 flex-1 truncate">{item.label}</span>
                        </NavLink>,
                      )}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
          ) : null}
          {shown.length === 0 ? (
            <p className="px-2 text-sm text-race-muted">{copy.noResults}</p>
          ) : null}
          {shown.map((group) => (
            <section key={group.id} className="mb-5">
              <h2 className="px-2 pb-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-race-muted">
                {group.label}
              </h2>
              <ul className="overflow-hidden rounded-[12px] border border-race-line/45 bg-race-surface">
                {group.chapters.map((item) => {
                  const Icon = item.icon ? ICONS[item.icon] : null;
                  const activeChapter = location?.chapterId === item.id;
                  const activeExact = activeChapter && !location?.subsectionId;
                  const expanded = activeChapter || query.trim().length > 0;
                  return (
                    <li key={item.id} className="border-b border-race-line/35 last:border-b-0">
                      {withPin(
                        item.id,
                        <NavLink
                          item={item}
                          active={Boolean(activeExact)}
                          external={copy.external}
                          className={cn(
                            "flex min-h-11 items-center gap-3 px-3 py-2 text-[15px] transition-colors hover:bg-race-accent/10",
                            activeChapter
                              ? "font-semibold text-foreground dark:text-white"
                              : "text-foreground/90",
                            activeExact && "bg-race-accent/15",
                          )}
                        >
                          {Icon ? (
                            <span className="flex size-7 shrink-0 items-center justify-center rounded-[8px] bg-race-accent/15 text-race-accent">
                              <Icon className="size-4" aria-hidden="true" />
                            </span>
                          ) : null}
                          <span className="min-w-0 flex-1 truncate">{item.label}</span>
                          {item.badge ? (
                            <span
                              className="rounded-full bg-race-accent-solid px-2 py-0.5 text-xs font-semibold text-white"
                              data-testid={`admin-nav-badge-${item.id}`}
                            >
                              {item.badge}
                            </span>
                          ) : null}
                          {item.children?.length ? (
                            <ChevronRight
                              className={cn(
                                "size-4 text-race-muted transition-transform",
                                expanded && "lg:rotate-90",
                              )}
                              aria-hidden="true"
                            />
                          ) : null}
                        </NavLink>,
                      )}
                      {item.children?.length ? (
                        <ul className={cn("pb-1", expanded ? "block" : "block lg:hidden")}>
                          {item.children.map((child) => {
                            const active = location?.subsectionId === child.id;
                            return (
                              <li key={child.id}>
                                {withPin(
                                  child.id,
                                  <NavLink
                                    item={child}
                                    active={active}
                                    external={copy.external}
                                    className={cn(
                                      "flex min-h-10 items-center gap-2 py-1.5 pl-[3.25rem] pr-3 text-sm transition-colors hover:bg-race-accent/10",
                                      active
                                        ? "bg-race-accent/15 font-semibold text-foreground dark:text-white"
                                        : "text-race-muted",
                                    )}
                                  >
                                    <span className="min-w-0 flex-1 truncate">{child.label}</span>
                                  </NavLink>,
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </nav>
      </aside>
      <div className="min-w-0 flex-1">
        {back ? (
          <div className="sticky top-0 z-20 flex items-center gap-2 border-b border-race-line/45 bg-race-deep/95 px-2 py-2 backdrop-blur lg:hidden">
            <Link
              href={back as AdminNavHref}
              className="flex min-h-10 items-center gap-1 rounded-[8px] px-2 text-[15px] font-semibold text-race-accent"
              data-testid="admin-back"
            >
              <ChevronLeft className="size-5" aria-hidden="true" />
              <span className="sr-only">{copy.back}: </span>
              {labelOf(back)}
            </Link>
          </div>
        ) : null}
        {!isIndex ? (
          <nav
            aria-label={copy.breadcrumb}
            className="hidden px-8 pt-6 lg:block"
            data-testid="admin-breadcrumb"
          >
            <ol className="flex flex-wrap items-center gap-1.5 text-sm text-race-muted">
              {trail.map((crumb, index) => (
                <li key={`${crumb.label}-${index}`} className="flex items-center gap-1.5">
                  {index > 0 ? <ChevronRight className="size-3.5" aria-hidden="true" /> : null}
                  {crumb.href ? (
                    <Link
                      href={crumb.href as AdminNavHref}
                      className="hover:text-race-accent hover:underline"
                    >
                      {crumb.label}
                    </Link>
                  ) : (
                    <span aria-current="page" className="text-foreground dark:text-white">
                      {crumb.label}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        ) : null}
        {children}
      </div>
    </div>
  );
}
