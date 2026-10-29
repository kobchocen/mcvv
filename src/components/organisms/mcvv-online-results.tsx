"use client";

import { useLocale, useTranslations } from "next-intl";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { ClubLink } from "@/components/molecules/club-link";
import { RecordBadge, RecordOverlay } from "@/components/molecules/record-alert";
import { FOLLOW_TOAST_MS, useFollowAlerts, type FollowToast } from "@/hooks/use-follow-alerts";
import { useFollowed } from "@/hooks/use-followed";
import { useLiveSnapshot } from "@/hooks/use-live-snapshot";
import { useRecordAlerts } from "@/hooks/use-record-alerts";
import { useTrDemo } from "@/hooks/use-tr-demo";
import { Link } from "@/i18n/routing";
import { clubIdFromSlug } from "@/lib/clubs/core";
import {
  clubFollowPick,
  clubFollowState,
  parseBibList,
  searchClubs,
  unknownFollowed,
  type ClubFollowState,
  type FollowEvent,
  type FollowSnap,
  type OnlineClub,
} from "@/lib/live/follow-core";
import {
  findCategoryBySlug,
  lossOf,
  onlineCategoryState,
  searchStatus,
  type OnlineCategory,
  type OnlineCategoryState,
  type OnlineRunner,
  decodeOnline,
  type OnlineWire,
} from "@/lib/live/online-results-core";
import {
  buildSearchIndex,
  byCategory,
  formatDayTime,
  formatMinutes,
  highlightRanges,
  lastPoint,
  nextPoint,
  POINTS,
  rankAt,
  recentPassages,
  searchRunners,
  virtualRank,
  type PointKey,
} from "@/lib/live/speaker-core";
import { formatStartOffsetLimit } from "@/lib/live/splits-screen-core";

import s from "./mcvv-online-results.module.css";

/** Mobilní rozvržení mockupu (chipy, sheet kategorií, hledání pod lupou). */
const MOBILE_QUERY = "(max-width: 700px)";
/** Poslední zvolená kategorie (když URL kategorii neurčuje). */
const STORAGE_KEY = "mcvv-online-k";
const RECENT_LIMIT = 8;
const FLASH_MS = 3600;

type Props = Readonly<{
  initial: OnlineWire;
  initialEtag: string;
  serverNowMs: number;
  /** Kategorie z URL (`/vysledky/online/<slug>`), jinak null. */
  initialSlug: string | null;
}>;

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");
const cap = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

function subscribeMobile(onChange: () => void) {
  const mql = window.matchMedia(MOBILE_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="2.4" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

/**
 * Veřejné online výsledky (náhrada OFeed) podle schváleného mockupu: vždy jedna kategorie
 * s kompletními výsledky (společný seznam jako speaker #188), pak odstartovaní bez mezičasu,
 * čekající na start a DNS. Data chodí jednou za 5 s (ETag/304), vše závislé na „teď“ se
 * přepočítává každou sekundu na klientu. Zvolená kategorie je v URL.
 */
const subscribeNothing = () => () => {};

/** Pohled místo kategorie: ★ Sledovaní (`?v=sledovani`, `?f=`) nebo přehled klubu (`?klub=<slug>`). */
type View = { t: "fol" } | { t: "klub"; slug: string };
type ShownView = { t: "fol" } | { t: "klub"; club: number };

function viewFromSearch(search: string): View | null {
  const params = new URLSearchParams(search);
  const klub = params.get("klub");
  if (klub) return { t: "klub", slug: klub };
  if (params.get("v") === "sledovani" || params.has("f")) return { t: "fol" };
  return null;
}

function resolveView(view: View | null, clubs: readonly OnlineClub[]): ShownView | null {
  if (!view || view.t === "fol") return view;
  const id = clubIdFromSlug(view.slug);
  const club = clubs.findIndex((c) => c.id === id);
  return club < 0 ? null : { t: "klub", club };
}

const readSearch = () => window.location.search;
const notificationsSupported = () => "Notification" in window;

function readRemembered(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null; // soukromý režim
  }
}

export function McvvOnlineResults({ initial, initialEtag, serverNowMs, initialSlug }: Props) {
  const t = useTranslations("OnlineResults");
  const locale = useLocale();
  const {
    snapshot: wire,
    nowMs,
    updatedMs,
    stale,
  } = useLiveSnapshot<OnlineWire>("/api/live/results", initial, initialEtag, serverNowMs);
  const snapshot = useMemo(() => decodeOnline(wire), [wire]);
  const records = useRecordAlerts({
    marks: snapshot.tr,
    updatedMs,
    resetKey: String(snapshot.year),
    demo: useTrDemo(),
  });
  const mobile = useSyncExternalStore(
    subscribeMobile,
    () => window.matchMedia(MOBILE_QUERY).matches,
    () => false,
  );
  const categories = snapshot.categories;
  // bez kategorie v URL → naposledy zvolená (localStorage), jinak první
  const remembered = useSyncExternalStore(subscribeNothing, readRemembered, () => null);
  const [chosen, setSlug] = useState<string | null>(
    findCategoryBySlug(categories, initialSlug)?.slug ?? null,
  );
  const slug =
    chosen ?? findCategoryBySlug(categories, remembered)?.slug ?? categories[0]?.slug ?? "";
  const [query, setQuery] = useState("");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [flashBib, setFlashBib] = useState<number | null>(null);
  const tabsRef = useRef<HTMLElement>(null);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const centerTab = useRef(true);

  const now = Math.floor(nowMs / 1000);
  const grace = snapshot.dnsGraceS;
  const grouped = useMemo(
    () => byCategory(snapshot.runners) as Map<string, OnlineRunner[]>,
    [snapshot.runners],
  );
  const states = new Map<string, OnlineCategoryState>(
    categories.map((c) => [c.id, onlineCategoryState(grouped.get(c.id) ?? [], now, grace)]),
  );
  const cat: OnlineCategory | undefined = categories.find((c) => c.slug === slug) ?? categories[0];
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const index = useMemo(() => buildSearchIndex(snapshot.runners), [snapshot.runners]);
  const hits = useMemo(() => searchRunners(index, query) as OnlineRunner[], [index, query]);
  const runnerByBib = useMemo(
    () => new Map(snapshot.runners.map((r) => [r.bib, r])),
    [snapshot.runners],
  );
  const clubMembers = useMemo(() => {
    const out = new Map<number, OnlineRunner[]>();
    for (const r of snapshot.runners) {
      if (r.club == null) continue;
      const list = out.get(r.club) ?? [];
      list.push(r);
      out.set(r.club, list);
    }
    return out;
  }, [snapshot.runners]);
  const clubHits = useMemo(() => searchClubs(snapshot.clubs, query), [snapshot.clubs, query]);

  // ★ sledovaní běžci a přehled klubu (#206) – jen v prohlížeči, pohled místo kategorie
  const followed = useFollowed(snapshot.year);
  const { add: addFollowed } = followed;
  const fset = new Set(followed.list);
  const limit = followed.limit;
  const search = useSyncExternalStore(subscribeNothing, readSearch, () => "");
  const canNotify = useSyncExternalStore(subscribeNothing, notificationsSupported, () => false);
  const freeze = new URLSearchParams(search).get("ffreeze") === "1";
  const [chosenView, setChosenView] = useState<View | null | undefined>(undefined);
  const view = resolveView(
    chosenView === undefined ? viewFromSearch(search) : chosenView,
    snapshot.clubs,
  );
  const [detailBib, setDetailBib] = useState<number | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const rowOf = (r: OnlineRunner) => states.get(r.cat)?.rows.find((x) => x.runner.bib === r.bib);
  const followSnaps = new Map<number, FollowSnap>();
  for (const bib of followed.list) {
    const r = runnerByBib.get(bib);
    if (!r) continue;
    followSnaps.set(bib, { m1: r.m1, m2: r.m2, fin: r.fin, final: !!rowOf(r)?.final });
  }

  const selectCategory = useCallback(
    (next: string, scroll = true) => {
      setSlug(next);
      setChosenView(null);
      setSheetOpen(false);
      centerTab.current = true;
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // soukromý režim – kategorie se jen nezapamatuje
      }
      window.history.replaceState(null, "", `/${locale}/vysledky/online/${next}`);
      if (scroll) window.scrollTo({ top: 0 });
    },
    [locale],
  );

  // zapamatovaná kategorie se propíše i do URL (sdílení odkazu)
  const hasView = view !== null;
  useEffect(() => {
    if (chosen !== null || !remembered || hasView) return;
    const found = findCategoryBySlug(categories, remembered);
    if (found) window.history.replaceState(null, "", `/${locale}/vysledky/online/${found.slug}`);
  }, [chosen, remembered, categories, locale, hasView]);

  // sdílený výběr ?f=234,203 → přidat ke sledovaným a ukázat záložku ★ (odkaz se nepřepisuje)
  useEffect(() => {
    const url = new URL(window.location.href);
    const f = url.searchParams.get("f");
    if (f === null) return;
    addFollowed(parseBibList(f));
    url.searchParams.delete("f");
    url.searchParams.set("v", "sledovani");
    window.history.replaceState(null, "", url);
  }, [addFollowed]);

  // Escape zavře detail běžce / seznam sledovaných
  const sheetShown = detailBib !== null || listOpen;
  useEffect(() => {
    if (!sheetShown) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setDetailBib(null);
      setListOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheetShown]);

  // aktivní chip na mobilu doprostřed
  useEffect(() => {
    // až po přepnutí na mobilní layout (první render je desktopový kvůli hydrataci)
    if (!centerTab.current || !mobile) return;
    centerTab.current = false;
    const tabs = tabsRef.current;
    const on = tabs?.querySelector<HTMLElement>(`[data-slug="${slug}"]`);
    if (tabs && on && mobile) {
      tabs.scrollLeft = on.offsetLeft - (tabs.clientWidth - on.offsetWidth) / 2;
    }
  }, [slug, mobile]);

  // řádek z hledání: doscrollovat a chvíli zvýraznit
  useEffect(() => {
    if (flashBib === null) return;
    document.querySelector(`[data-online-row="${flashBib}"]`)?.scrollIntoView({ block: "center" });
    const id = window.setTimeout(() => setFlashBib(null), FLASH_MS);
    return () => window.clearTimeout(id);
  }, [flashBib]);

  useEffect(() => {
    if (searchOpen) mobileInputRef.current?.focus();
  }, [searchOpen]);

  const pickRunner = (r: OnlineRunner) => {
    setListOpen(false);
    const target = catById.get(r.cat);
    if (target) selectCategory(target.slug, false);
    setQuery("");
    setSearchOpen(false);
    setFlashBib(r.bib);
  };

  const tags = {
    b: (chunks: ReactNode) => <b className={s.num}>{chunks}</b>,
    ok: (chunks: ReactNode) => <b className={s.lgOk}>{chunks}</b>,
    i: (chunks: ReactNode) => <i>{chunks}</i>,
  };
  const pointLabel = (k: PointKey) =>
    k === "m1" ? t("pointM1") : k === "m2" ? t("pointM2") : t("pointFin");

  /* ---------- ★ sledovaní (#206) ---------- */
  const eventShort = (e: FollowEvent, r: OnlineRunner) => {
    const rank = rowOf(r)?.rank ?? "–";
    if (e.kind === "split") return `${pointLabel(e.point)} ${formatMinutes(r[e.point] ?? 0)}`;
    if (e.kind === "fin") return `${pointLabel("fin")} ${formatMinutes(r.fin ?? 0)} (${rank}.)`;
    return `✓ ${rank}.`;
  };
  const describeToast = (toast: FollowToast) => {
    if (toast.kind === "info") return null;
    if (toast.kind === "summary") {
      return {
        title: t("notifSummaryTitle"),
        body: t("notifSummary", { count: toast.events.length }),
      };
    }
    const r = runnerByBib.get(toast.bib);
    if (!r) return null;
    const title = `★ ${r.name}`;
    const rank = rowOf(r)?.rank ?? "–";
    if (toast.kind === "split") {
      return {
        title,
        body: t("notifSplit", {
          point: pointLabel(toast.point),
          time: formatMinutes(r[toast.point] ?? 0),
          cat: catById.get(r.cat)?.name ?? r.cat,
        }),
      };
    }
    if (toast.kind === "fin") {
      return { title, body: t("notifFin", { time: formatMinutes(r.fin ?? 0), rank }) };
    }
    return { title, body: t("notifFinal", { rank }) };
  };
  const alerts = useFollowAlerts({
    snaps: followSnaps,
    nowMs,
    freeze,
    notify: followed.notify,
    describe: describeToast,
  });

  const toggleFollow = (bib: number) => {
    if (!followed.toggle(bib)) alerts.info(t("limitTitle", { limit }), t("limitSub"));
  };
  const star = (bib: number) => {
    const on = fset.has(bib);
    return (
      <button
        type="button"
        className={cx(s.fst, on && s.on)}
        aria-pressed={on}
        title={on ? t("unfollowStar") : t("followStar")}
        aria-label={on ? t("unfollowStar") : t("followStar")}
        data-testid="online-follow-star"
        onClick={(e) => {
          e.stopPropagation();
          toggleFollow(bib);
        }}
      >
        {on ? "★" : "☆"}
      </button>
    );
  };
  const closeSheets = () => {
    setDetailBib(null);
    setListOpen(false);
  };
  const openView = (next: View) => {
    setChosenView(next);
    closeSheets();
    setSheetOpen(false);
    setQuery("");
    setSearchOpen(false);
    const q = next.t === "fol" ? "v=sledovani" : `klub=${encodeURIComponent(next.slug)}`;
    window.history.replaceState(null, "", `/${locale}/vysledky/online?${q}`);
    window.scrollTo({ top: 0 });
  };
  const closeView = () => {
    setChosenView(null);
    if (cat) window.history.replaceState(null, "", `/${locale}/vysledky/online/${cat.slug}`);
  };
  const toggleNotify = () => {
    const on = !followed.notify;
    followed.setNotify(on);
    if (on && "Notification" in window && Notification.permission === "default") {
      void Notification.requestPermission();
    }
  };
  const share = (label: string, query: string) => (
    <button
      type="button"
      className={cx(s.vbtn, s.ghost)}
      data-testid="online-share"
      onClick={() => {
        const url = `${window.location.origin}/${locale}/vysledky/online${query}`;
        void navigator.clipboard?.writeText(url).catch(() => {});
        alerts.info(t("copied"), url);
      }}
    >
      {label}
    </button>
  );
  const followClub = (club: OnlineClub, list: readonly OnlineRunner[]) => {
    const st = clubFollowState(list, followed.list);
    if (st.kind === "full") return;
    if (st.kind === "unfollow") {
      const bibs = new Set(list.map((r) => r.bib));
      followed.save(followed.list.filter((b) => !bibs.has(b)));
      alerts.info(t("clubUnfollowTitle", { club: club.name }), t("clubUnfollowSub"));
      return;
    }
    const pick = clubFollowPick(list, followed.list, now, grace);
    followed.save([...followed.list, ...pick]);
    alerts.info(
      t("clubFollowedTitle", { count: pick.length, total: list.length, club: club.name }),
      pick.length < st.n
        ? t("clubFollowedPartial", { limit, rest: st.n - pick.length })
        : t("clubFollowedAll"),
    );
  };
  const clubButton = (club: OnlineClub, list: readonly OnlineRunner[], st: ClubFollowState) => {
    const onClick = () => followClub(club, list);
    switch (st.kind) {
      case "unfollow":
        return (
          <button type="button" className={cx(s.vbtn, s.on)} onClick={onClick}>
            {t("btnUnfollowAll", { count: st.n })}
          </button>
        );
      case "full":
        return (
          <button type="button" className={s.vbtn} disabled title={t("limitSub")}>
            {t("btnFull", { limit })}
          </button>
        );
      case "all":
        return (
          <button
            type="button"
            className={s.vbtn}
            onClick={onClick}
            data-testid="online-club-follow"
          >
            {t("btnFollowAll", { count: st.n })}
          </button>
        );
      case "some":
        return (
          <button
            type="button"
            className={s.vbtn}
            onClick={onClick}
            data-testid="online-club-follow"
          >
            {t("btnFollowSome", { free: st.free, count: st.n })}
            <small>{t("btnFollowSomeHint", { limit })}</small>
          </button>
        );
    }
  };

  const renderName = (name: string) => {
    const marks = highlightRanges(name, query);
    const parts: ReactNode[] = [];
    let i = 0;
    while (i < name.length) {
      const on = marks[i];
      let j = i;
      while (j < name.length && marks[j] === on) j += 1;
      const text = name.slice(i, j);
      parts.push(on ? <mark key={i}>{text}</mark> : <Fragment key={i}>{text}</Fragment>);
      i = j;
    }
    return parts;
  };

  const statusText = (r: OnlineRunner) => {
    const st = searchStatus(r, grouped.get(r.cat) ?? [], now, grace);
    switch (st.kind) {
      case "finished":
        return t("stFinished", { time: formatMinutes(st.time), rank: st.rank });
      case "on-course":
        return t("stOnCourse", { point: pointLabel(st.point), time: formatMinutes(st.time) });
      case "running":
        return t("stRunning", { time: formatMinutes(st.live) });
      case "dns":
        return t("stDns");
      case "waiting":
        return t("stWaiting", { time: formatDayTime(st.start) });
    }
  };

  const searchResults = query.trim() ? (
    <div className={s.ac}>
      {hits.map((r) => (
        <div key={r.bib} className={cx(s.it, s.star)} data-testid="online-search-hit">
          {star(r.bib)}
          <button type="button" className={s.itb} onClick={() => pickRunner(r)}>
            <span className={cx(s.b, s.num)}>{r.bib}</span>
            <span className={s.n}>
              {renderName(r.name)}
              <small>{cap(catById.get(r.cat)?.name ?? r.cat)}</small>
            </span>
            <span className={s.s}>{statusText(r)}</span>
          </button>
        </div>
      ))}
      {clubHits.map((c) => (
        <button
          type="button"
          key={c.id}
          className={cx(s.it, s.clubhit)}
          onClick={() => openView({ t: "klub", slug: c.slug })}
          data-testid="online-search-club"
        >
          <span className={s.ci}>⌂</span>
          <span className={cx(s.b, s.num)}>{c.id}</span>
          <span className={s.n}>
            {c.name}
            <small>
              {t("clubHit", { count: clubMembers.get(snapshot.clubs.indexOf(c))?.length ?? 0 })}
            </small>
          </span>
          <span className={s.s}>{t("clubHitGo")}</span>
        </button>
      ))}
      {!hits.length && !clubHits.length ? <div className={s.none}>{t("searchNone")}</div> : null}
    </div>
  ) : null;

  const searchBox = (ref?: React.Ref<HTMLInputElement>) => (
    <div className={s.sbox}>
      <SearchIcon />
      <input
        ref={ref}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t("searchPlaceholder")}
        aria-label={t("searchLabel")}
        autoComplete="off"
        data-testid="online-search"
      />
    </div>
  );

  const tab = (c: OnlineCategory, inSheet = false) => {
    const st = states.get(c.id);
    if (!st) return null;
    return (
      <button
        type="button"
        key={c.id}
        data-slug={c.slug}
        className={cx(s.tab, !view && c.slug === cat?.slug && s.on, !inSheet && st.done && s.done)}
        onClick={() => selectCategory(c.slug)}
        aria-current={!view && c.slug === cat?.slug ? "page" : undefined}
      >
        <span>
          {st.done ? <span className={s.tok}>✓</span> : null}
          {inSheet || !mobile ? c.name : c.short}
        </span>{" "}
        <span className={cx(s.tc, s.num)}>
          {st.finished}/{st.total}
        </span>
        {!inSheet && st.recent ? <i className={s.tnew} title={t("recentDot")} /> : null}
      </button>
    );
  };

  const timeCells = (r: OnlineRunner, hit: boolean) => {
    const cur = lastPoint(r);
    const next = nextPoint(r);
    return POINTS.map((k) => {
      const value = r[k];
      if (value != null) {
        return (
          <td
            key={k}
            className={cx(
              k === "fin" ? s.fin : s.t,
              k !== "fin" && k === cur && s.cur,
              hit && k === cur && s.hit,
              s.num,
            )}
          >
            {formatMinutes(value)}
          </td>
        );
      }
      if (k === next && now >= r.start) {
        return (
          <td key={k} className={cx(s.run, s.num)}>
            <span className={cx(s.runv, s.num)}>{formatMinutes(now - r.start)}</span>
          </td>
        );
      }
      return (
        <td key={k} className={cx(s.na, s.num)}>
          –
        </td>
      );
    });
  };

  const renderTable = (S: OnlineCategoryState) => {
    const cols = mobile ? 6 : 9;
    const vr = (r: OnlineRunner) => (
      <span className={cx(s.vrk, s.num)}>
        <small>{t("ifNow")}</small>
        {virtualRank(S.finTimes, now - r.start)}.
      </span>
    );
    const divider = (cls: string | false, label: string, n: number) => (
      <tr className={cx(s.div, cls)}>
        <td colSpan={cols}>
          <div>
            {label} <b>{n}</b>
          </div>
        </td>
      </tr>
    );
    const resultRow = (r: OnlineRunner, rank: number | null, final: boolean, recent: boolean) => {
      const finished = r.fin != null;
      const loss = lossOf(r.fin, S.best);
      const lossText = loss != null ? `+${formatMinutes(loss)}` : "";
      return (
        <tr
          key={r.bib}
          data-online-row={r.bib}
          className={cx(
            s.r,
            recent && s.new,
            final && s.final,
            !finished && s.on,
            flashBib === r.bib && s.flash,
            fset.has(r.bib) && s.fol,
          )}
          onClick={() => setDetailBib(r.bib)}
        >
          <td className={cx(s.rk, s.num)}>
            {rank != null ? (
              <>
                {final ? <span className={s.okc}>✓</span> : null}
                {rank}.
              </>
            ) : null}
          </td>
          <td className={cx(s.bib, s.num)}>{r.bib}</td>
          <td className={s.nm} title={r.name}>
            {star(r.bib)}
            <RecordBadge kind={records.badges.get(r.bib)} />
            {r.name}
            {!mobile && r.late != null ? (
              <span className={cx(s.chip, s.late)}>
                {t("late", { offset: formatMinutes(r.late) })}
              </span>
            ) : null}
            {mobile ? (
              <span className={s.m2l}>
                {t.rich("startAt", { ...tags, time: formatDayTime(r.start) })}
                {r.late != null ? (
                  <>
                    {" "}
                    <span className={s.late}>
                      {t("lateShort", { offset: formatMinutes(r.late) })}
                    </span>
                  </>
                ) : null}
                {finished ? lossText ? ` · ${lossText}` : "" : <> · {vr(r)}</>}
              </span>
            ) : null}
          </td>
          {mobile ? null : <td className={cx(s.st, s.num)}>{formatDayTime(r.start)}</td>}
          {timeCells(r, recent)}
          {mobile ? null : (
            <>
              <td className={cx(s.loss, s.num)}>{lossText}</td>
              <td className={cx(s.vr, s.num)}>{finished ? null : vr(r)}</td>
            </>
          )}
        </tr>
      );
    };

    return (
      <table className={s.table}>
        <colgroup>
          <col className={s["c-rk"]} />
          <col className={s["c-bib"]} />
          <col />
          {mobile ? null : <col className={s["c-st"]} />}
          <col className={s["c-t"]} />
          <col className={s["c-t"]} />
          <col className={s["c-f"]} />
          {mobile ? null : (
            <>
              <col className={s["c-l"]} />
              <col className={s["c-v"]} />
            </>
          )}
        </colgroup>
        <thead>
          <tr>
            <th>{t("colRank")}</th>
            <th>{t("colBib")}</th>
            <th className={s.l}>{t("colName")}</th>
            {mobile ? null : <th>{t("colStart")}</th>}
            <th>
              {t("colM1")}
              {mobile ? null : <small>{t("km1")}</small>}
            </th>
            <th>
              {t("colM2")}
              {mobile ? null : <small>{t("km2")}</small>}
            </th>
            <th>{t("colFin")}</th>
            {mobile ? null : (
              <>
                <th>{t("colLoss")}</th>
                <th>{t("colIfNow")}</th>
              </>
            )}
          </tr>
        </thead>
        <tbody>
          {S.rows.map((row) => resultRow(row.runner, row.rank, row.final, row.recent))}
          {S.running.length ? (
            <>
              {divider(s.sm, t("divRunning"), S.running.length)}
              {S.running.map((r) => resultRow(r, null, false, false))}
            </>
          ) : null}
          {!S.rows.length && !S.running.length ? (
            <tr>
              <td colSpan={cols} className={s.empty}>
                {t("nobody")}
              </td>
            </tr>
          ) : null}
          {S.waiting.length ? (
            <>
              {divider(s.wait, t("divWaiting"), S.waiting.length)}
              {S.waiting.map((r) => {
                const d = r.start - now;
                return (
                  <tr
                    key={r.bib}
                    data-online-row={r.bib}
                    className={cx(
                      s.r,
                      s.w,
                      flashBib === r.bib && s.flash,
                      fset.has(r.bib) && s.fol,
                    )}
                    onClick={() => setDetailBib(r.bib)}
                  >
                    <td className={s.rk} />
                    <td className={cx(s.bib, s.num)}>{r.bib}</td>
                    <td className={s.nm}>
                      {star(r.bib)}
                      {r.name}
                      {mobile ? (
                        <span className={s.m2l}>
                          {t.rich("startAt", { ...tags, time: formatDayTime(r.start) })}
                        </span>
                      ) : null}
                    </td>
                    {mobile ? null : <td className={cx(s.st, s.num)}>{formatDayTime(r.start)}</td>}
                    <td className={s.ws} colSpan={mobile ? 3 : 5}>
                      {d > 0 ? (
                        t.rich("startsIn", { ...tags, time: formatMinutes(d) })
                      ) : (
                        <span className={s.pend}>{mobile ? t("pendingShort") : t("pending")}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </>
          ) : null}
          {S.dns.length ? (
            <>
              {divider(s.dns, t("divDns"), S.dns.length)}
              {S.dns.map((r) => (
                <tr
                  key={r.bib}
                  data-online-row={r.bib}
                  className={cx(
                    s.r,
                    s.dnsr,
                    flashBib === r.bib && s.flash,
                    fset.has(r.bib) && s.fol,
                  )}
                  onClick={() => setDetailBib(r.bib)}
                >
                  <td className={s.rk} />
                  <td className={cx(s.bib, s.num)}>{r.bib}</td>
                  <td className={s.nm}>
                    {star(r.bib)}
                    {r.name}
                    {mobile ? (
                      <span className={s.m2l}>
                        {t.rich("startAt", { b: (c) => c, time: formatDayTime(r.start) })}
                      </span>
                    ) : null}
                  </td>
                  {mobile ? null : <td className={cx(s.st, s.num)}>{formatDayTime(r.start)}</td>}
                  <td className={s.ws} colSpan={mobile ? 3 : 5}>
                    <span className={cx(s.chip, s.dnsc)}>DNS</span>
                    {mobile ? null : (
                      <>
                        {"\u00a0 "}
                        {t("dnsNote", { grace: formatStartOffsetLimit(grace) })}
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </>
          ) : null}
        </tbody>
      </table>
    );
  };

  /* ---------- pohled ★ Sledovaní / přehled klubu ---------- */
  const buildView = (v: ShownView) => {
    const club = v.t === "klub" ? snapshot.clubs[v.club] : undefined;
    const list =
      v.t === "klub"
        ? (clubMembers.get(v.club) ?? [])
        : followed.list
            .map((b) => runnerByBib.get(b))
            .filter((r): r is OnlineRunner => r !== undefined);
    const inList = new Set(list.map((r) => r.bib));
    const cols = mobile ? 6 : 9;
    const cnt = { fin: 0, run: 0, wait: 0, dns: 0 };
    const body: ReactNode[] = [];
    for (const c of categories) {
      const S0 = states.get(c.id);
      if (!S0) continue;
      const ordered = [
        ...S0.rows.map((x) => x.runner),
        ...S0.running,
        ...S0.waiting,
        ...S0.dns,
      ].filter((r) => inList.has(r.bib));
      if (!ordered.length) continue;
      body.push(
        <tr key={`c-${c.id}`} className={cx(s.div, s.vcat)}>
          <td colSpan={cols}>
            <div>
              <button type="button" className={s.vk} onClick={() => selectCategory(c.slug)}>
                {c.name} ›
              </button>{" "}
              <b>{ordered.length}</b>
              {S0.done ? <span className={s.okc}>{t("catFinal")}</span> : null}
            </div>
          </td>
        </tr>,
      );
      const rowBy = new Map(S0.rows.map((x) => [x.runner.bib, x]));
      const dnsBibs = new Set(S0.dns.map((r) => r.bib));
      for (const r of ordered) {
        const row = rowBy.get(r.bib);
        const kind =
          r.fin != null ? "fin" : row || r.started ? "run" : dnsBibs.has(r.bib) ? "dns" : "wait";
        cnt[kind] += 1;
        const loss = kind === "fin" ? lossOf(r.fin, S0.best) : null;
        const lossText = loss != null ? `+${formatMinutes(loss)}` : "";
        const vrk = (
          <span className={cx(s.vrk, s.num)}>
            <small>{t("ifNow")}</small>
            {virtualRank(S0.finTimes, now - r.start)}.
          </span>
        );
        const d = r.start - now;
        const status =
          kind === "fin" ? (
            row?.final ? (
              <span className={s.fok}>{t("stFinal")}</span>
            ) : (
              t("stProv")
            )
          ) : kind === "run" ? (
            vrk
          ) : kind === "dns" ? (
            mobile ? (
              "DNS"
            ) : (
              <span className={cx(s.chip, s.dnsc)}>DNS</span>
            )
          ) : d > 0 ? (
            t.rich("startsIn", { ...tags, time: formatMinutes(d) })
          ) : (
            <span className={s.pend}>{mobile ? t("pendingShort") : t("pending")}</span>
          );
        body.push(
          <tr
            key={r.bib}
            data-online-row={r.bib}
            className={cx(
              s.r,
              kind !== "fin" && s.on,
              row?.final && s.final,
              kind === "dns" && s.dnsr,
              kind === "wait" && s.w,
              fset.has(r.bib) && s.fol,
            )}
            onClick={() => setDetailBib(r.bib)}
          >
            <td className={cx(s.rk, s.num)}>
              {row?.rank != null ? (
                <>
                  {row.final ? <span className={s.okc}>✓</span> : null}
                  {row.rank}.
                </>
              ) : null}
            </td>
            <td className={cx(s.bib, s.num)}>{r.bib}</td>
            <td className={s.nm} title={r.name}>
              {star(r.bib)}
              <RecordBadge kind={records.badges.get(r.bib)} />
              {r.name}
              {mobile ? (
                <span className={s.m2l}>
                  {c.short} · {t.rich("startAt", { ...tags, time: formatDayTime(r.start) })}
                  {kind === "fin" ? (lossText ? ` · ${lossText}` : "") : null}
                  {kind === "run" ? <> · {vrk}</> : null}
                </span>
              ) : null}
            </td>
            {mobile ? null : <td className={cx(s.st, s.num)}>{formatDayTime(r.start)}</td>}
            {kind === "fin" || kind === "run" ? (
              <>
                {timeCells(r, false)}
                {mobile ? null : (
                  <>
                    <td className={cx(s.loss, s.num)}>{lossText}</td>
                    <td className={cx(s.vst, s.num)}>{status}</td>
                  </>
                )}
              </>
            ) : (
              <td className={s.ws} colSpan={mobile ? 3 : 5}>
                {status}
              </td>
            )}
          </tr>,
        );
      }
    }
    const unknown = v.t === "fol" ? unknownFollowed(followed.list, runnerByBib) : [];
    if (unknown.length) {
      body.push(
        <tr key="c-unknown" className={cx(s.div, s.vcat)}>
          <td colSpan={cols}>
            <div>
              {t("unknownGroup")} <b>{unknown.length}</b>
            </div>
          </td>
        </tr>,
      );
      for (const bib of unknown) {
        body.push(
          <tr key={`u-${bib}`} className={cx(s.r, s.funk)} data-online-unknown={bib}>
            <td className={s.rk} />
            <td className={cx(s.bib, s.num)}>{bib}</td>
            <td className={s.nm}>
              {t("unknownRunner", { bib })}
              {mobile ? <span className={s.m2l}>{t("unknownSub")}</span> : null}
            </td>
            {mobile ? null : <td className={s.st} />}
            <td className={s.ws} colSpan={mobile ? 3 : 5}>
              {mobile ? null : <span className={s.funkSub}>{t("unknownSub")}</span>}
              <button
                type="button"
                className={cx(s.vbtn, s.ghost, s.funkX)}
                data-testid="online-unknown-remove"
                onClick={() => toggleFollow(bib)}
              >
                × {t("unknownRemove")}
              </button>
            </td>
          </tr>,
        );
      }
    }
    const section = (
      <section
        className={cx(s.cat, s.vview, club && s.vclub)}
        data-testid={club ? "online-club-view" : "online-follow-view"}
      >
        <div className={s.ch}>
          <h2>
            <span className={s.vs}>{club ? "⌂" : "★"}</span>{" "}
            {club ? club.name : t("viewFollowTitle")}
          </h2>
          <span className={s.cnt}>
            {t.rich("count", { ...tags, fin: cnt.fin, on: cnt.run, wait: cnt.wait, dns: cnt.dns })}
          </span>
        </div>
        <div className={s.vbar}>
          <span className={s.vsub}>
            {club
              ? t("viewClubSub", { count: list.length, cats: new Set(list.map((r) => r.cat)).size })
              : t("viewFollowSub", { count: followed.list.length, limit })}
          </span>
          <span className={s.vacts}>
            {club ? (
              <>
                {clubButton(club, list, clubFollowState(list, followed.list))}
                {share(mobile ? t("shareShort") : t("shareClub"), `?klub=${club.slug}`)}
                <ClubLink
                  slug={club.slug}
                  id={club.id}
                  name={club.name}
                  className={cx(s.vbtn, s.ghost)}
                >
                  {t("clubProfile")}
                </ClubLink>
              </>
            ) : followed.list.length ? (
              share(mobile ? t("shareShort") : t("shareFollow"), `?f=${followed.list.join(",")}`)
            ) : null}
          </span>
        </div>
        <table className={s.table}>
          <colgroup>
            <col className={s["c-rk"]} />
            <col className={s["c-bib"]} />
            <col />
            {mobile ? null : <col className={s["c-st"]} />}
            <col className={s["c-t"]} />
            <col className={s["c-t"]} />
            <col className={s["c-f"]} />
            {mobile ? null : (
              <>
                <col className={s["c-l"]} />
                <col className={s["c-v"]} />
              </>
            )}
          </colgroup>
          <thead>
            <tr>
              <th>
                {t("colRank")}
                <small>{t("colRankCat")}</small>
              </th>
              <th>{t("colBib")}</th>
              <th className={s.l}>{t("colName")}</th>
              {mobile ? null : <th>{t("colStart")}</th>}
              <th>{t("colM1")}</th>
              <th>{t("colM2")}</th>
              <th>{t("colFin")}</th>
              {mobile ? null : (
                <>
                  <th>{t("colLoss")}</th>
                  <th>{t("colStatus")}</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {body}
            {!list.length ? (
              <tr>
                <td colSpan={cols} className={s.vempty}>
                  {t("viewEmpty", { limit })}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    );
    const summary = (
      <div className={s.box}>
        <h3>
          {club ? club.name : t("followTitle")}
          <small>
            {club
              ? t("sumClubCount", { count: list.length })
              : t("sumFollowCount", { count: followed.list.length, limit })}
          </small>
        </h3>
        <div className={s.stats}>
          <div className={cx(s.stat, s.ok)}>
            <b className={s.num}>{cnt.fin}</b>
            <span>{t("statFin")}</span>
          </div>
          <div className={cx(s.stat, s.run)}>
            <b className={s.num}>{cnt.run}</b>
            <span>{t("statOn")}</span>
          </div>
          <div className={s.stat}>
            <b className={s.num}>{cnt.wait}</b>
            <span>{t("statWait")}</span>
          </div>
          <div className={cx(s.stat, s.gr)}>
            <b className={s.num}>{cnt.dns}</b>
            <span>{t("statDns")}</span>
          </div>
        </div>
        <p className={s.meta}>
          {club ? (
            <ClubLink slug={club.slug} id={club.id} name={club.name}>
              {t("clubProfile")}
            </ClubLink>
          ) : (
            t("sumFollowNote")
          )}
        </p>
      </div>
    );
    return { section, summary, club, count: list.length };
  };

  /* ---------- seznam sledovaných, detail běžce, hlášení ---------- */
  const followStatus = (r: OnlineRunner): ReactNode => {
    const row = rowOf(r);
    if (r.fin != null) {
      return (
        <>
          <b>{formatMinutes(r.fin)}</b> ·{" "}
          {row?.final ? <span className={s.fok}>✓{row.rank}.</span> : `${row?.rank ?? "–"}.`}
        </>
      );
    }
    const k = lastPoint(r);
    if (k) {
      return (
        <>
          {pointLabel(k)} <b>{formatMinutes(r[k] as number)}</b> ·{" "}
          <span className={s.frun}>{formatMinutes(Math.max(0, now - r.start))}</span>
        </>
      );
    }
    if (r.started) {
      return (
        <>
          {t("detailRunning")}{" "}
          <span className={s.frun}>{formatMinutes(Math.max(0, now - r.start))}</span>
        </>
      );
    }
    if (states.get(r.cat)?.dns.some((x) => x.bib === r.bib)) return t("stDns");
    return t("stWaiting", { time: formatDayTime(r.start) });
  };
  const followList = (inSheet: boolean) =>
    followed.list.length ? (
      <div className={s.fl}>
        {followed.list.map((bib) => {
          const r = runnerByBib.get(bib);
          if (!r) {
            return (
              <div
                className={cx(s.fi, s.funk)}
                key={bib}
                data-testid="online-follow-item"
                data-unknown=""
              >
                <span className={s.fst} aria-hidden="true">
                  ★
                </span>
                <span className={s.fgo}>
                  <span className={cx(s.fib, s.num)}>{bib}</span>
                  <span className={s.fin2}>
                    {t("unknownRunner", { bib })}
                    <small>{t("unknownSub")}</small>
                  </span>
                  <span className={s.fis} />
                </span>
                <button
                  type="button"
                  className={s.fix}
                  title={t("unknownRemove")}
                  aria-label={t("unknownRemove")}
                  data-testid="online-follow-remove"
                  onClick={() => toggleFollow(bib)}
                >
                  ×
                </button>
              </div>
            );
          }
          const c = catById.get(r.cat);
          return (
            <div className={s.fi} key={bib} data-testid="online-follow-item">
              {star(bib)}
              <button type="button" className={s.fgo} onClick={() => pickRunner(r)}>
                <span className={cx(s.fib, s.num)}>{bib}</span>
                <span className={s.fin2}>
                  {r.name}
                  <small>{inSheet ? c?.name : c?.short}</small>
                </span>
                <span className={s.fis}>{followStatus(r)}</span>
              </button>
              <button
                type="button"
                className={s.fix}
                title={t("unfollowStar")}
                aria-label={t("unfollowStar")}
                onClick={() => toggleFollow(bib)}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>
    ) : (
      <p className={s.fempty}>{t("followEmpty")}</p>
    );
  const notifyOption =
    followed.list.length && canNotify ? (
      <button
        type="button"
        className={s.fopt}
        role="switch"
        aria-checked={followed.notify}
        onClick={toggleNotify}
      >
        <span className={cx(s.fsw, followed.notify && s.on)} />
        <span>
          {t("notifyLabel")}
          <small>{t("notifyHint")}</small>
        </span>
      </button>
    ) : null;

  const renderDetail = (r: OnlineRunner) => {
    const row = rowOf(r);
    const club = r.club != null ? snapshot.clubs[r.club] : undefined;
    const on = fset.has(r.bib);
    const next = nextPoint(r);
    const catRunners = grouped.get(r.cat) ?? [];
    const rank = row?.rank;
    return (
      <>
        <h4>
          {t("detailTitle")}
          <button type="button" onClick={closeSheets}>
            {t("close")}
          </button>
        </h4>
        <div className={s.rdhd}>
          <span className={cx(s.rdb, s.num)}>{r.bib}</span>
          <span className={s.rdn}>{r.name}</span>
        </div>
        {club && r.club != null ? (
          <button
            type="button"
            className={s.rclub}
            data-testid="online-detail-club"
            onClick={() => openView({ t: "klub", slug: club.slug })}
          >
            <span className={s.rcI}>⌂</span>
            <span className={s.rcN}>{club.name}</span>
            <small>{t("detailClub", { count: clubMembers.get(r.club)?.length ?? 0 })}</small>
          </button>
        ) : null}
        <div className={s.rdcat}>
          {t("detailCat", {
            cat: cap(catById.get(r.cat)?.name ?? r.cat),
            time: formatDayTime(r.start),
          })}
          {r.fin != null && rank != null
            ? row?.final
              ? t("detailFinal", { rank })
              : t("detailProv", { rank })
            : null}
        </div>
        <div className={s.rdpts}>
          {POINTS.map((k) => {
            const v = r[k];
            return (
              <div key={k}>
                {pointLabel(k)}
                {v != null ? (
                  <>
                    <b className={s.num}>{formatMinutes(v)}</b>
                    <small>{t("detailAtPoint", { rank: rankAt(catRunners, k, v) })}</small>
                  </>
                ) : k === next && now >= r.start && (r.started || lastPoint(r)) ? (
                  <>
                    <span className={cx(s.rdrun, s.num)}>{formatMinutes(now - r.start)}</span>
                    <small>{t("detailRunning")}</small>
                  </>
                ) : (
                  <>
                    <b>–</b>
                    <small>{"\u00a0"}</small>
                  </>
                )}
              </div>
            );
          })}
        </div>
        <button
          type="button"
          className={cx(s.rdfollow, on && s.on)}
          onClick={() => toggleFollow(r.bib)}
          data-testid="online-detail-follow"
        >
          {on ? t("detailUnfollow") : t("detailFollow")}
        </button>
        <p className={s.rdhint}>{t("detailHint")}</p>
      </>
    );
  };

  const toastBody = (toast: FollowToast): ReactNode => {
    if (toast.kind === "info") {
      return (
        <>
          <div className={s.ftk}>{toast.title}</div>
          <div className={s.ftsub}>{toast.sub}</div>
        </>
      );
    }
    if (toast.kind === "summary") {
      return (
        <>
          <div className={s.ftk}>{t("toastSummary", { count: toast.events.length })}</div>
          {toast.events.slice(0, 5).map((e, i) => {
            const r = runnerByBib.get(e.bib);
            return r ? (
              <div key={i} className={s.ftsub}>
                <b className={cx(s.ftb, s.num)}>{e.bib}</b>
                {r.name} – {eventShort(e, r)}
              </div>
            ) : null;
          })}
        </>
      );
    }
    const r = runnerByBib.get(toast.bib);
    const S0 = r ? states.get(r.cat) : undefined;
    if (!r || !S0) return null;
    const c = catById.get(r.cat);
    const rank = rowOf(r)?.rank ?? "–";
    const who = (
      <div className={s.ftwho}>
        <span className={cx(s.ftb, s.num)}>★ {r.bib}</span>
        {r.name}
        <small>{c?.short}</small>
      </div>
    );
    const at = (k: PointKey) => formatDayTime(r.start + (r[k] ?? 0));
    if (toast.kind === "split") {
      const k = toast.point;
      const v = r[k] ?? 0;
      const catRunners = grouped.get(r.cat) ?? [];
      const lead = Math.min(...catRunners.map((x) => x[k] ?? Number.POSITIVE_INFINITY));
      return (
        <>
          <div className={s.ftk}>
            {t("toastSplit", { point: pointLabel(k), km: k === "m1" ? t("km1") : t("km2") })}
            <span className={s.fttm}>{at(k)}</span>
          </div>
          {who}
          <div className={s.ftbig}>
            <span className={s.ftpt}>{pointLabel(k)}</span>
            <span className={cx(s.ftt, s.num)}>{formatMinutes(v)}</span>
            <span className={cx(s.ftrk, s.num)}>
              {rankAt(catRunners, k, v)}.
              <small>{t("toastAtPoint", { point: pointLabel(k) })}</small>
            </span>
          </div>
          <div className={s.ftsub}>
            {v <= lead
              ? t("toastBestAtPoint")
              : t("toastBehind", { time: formatMinutes(v - lead) })}
            {r.fin == null
              ? t("toastIfNow", { rank: virtualRank(S0.finTimes, now - r.start) })
              : null}
          </div>
        </>
      );
    }
    const fin = r.fin ?? 0;
    if (toast.kind === "fin") {
      return (
        <>
          <div className={s.ftk}>
            {t("toastFin")}
            <span className={s.fttm}>{at("fin")}</span>
          </div>
          {who}
          <div className={s.ftbig}>
            <span className={s.ftpt}>{t("pointFin")}</span>
            <span className={cx(s.ftt, s.num)}>{formatMinutes(fin)}</span>
            <span className={cx(s.ftrk, s.num)}>
              {rank}.<small>{t("toastProv")}</small>
            </span>
          </div>
          <div className={s.ftsub}>
            {S0.best == null || fin <= S0.best
              ? t("toastLeads")
              : t("toastLoss", { time: formatMinutes(fin - S0.best) })}
            {S0.onCourse ? t("toastOnCourse", { count: S0.onCourse }) : null}
          </div>
        </>
      );
    }
    return (
      <>
        <div className={s.ftk}>{t("toastFinal")}</div>
        {who}
        <div className={s.ftbig}>
          <span className={cx(s.ftrk, s.num)}>{t("toastPlace", { rank })}</span>
          <span className={cx(s.ftt, s.small, s.num)}>{formatMinutes(fin)}</span>
        </div>
        <div className={s.ftsub}>{t("toastFinalSub", { cat: c?.name ?? r.cat })}</div>
      </>
    );
  };

  const shownView = view ? buildView(view) : null;
  const detailRunner = detailBib !== null ? runnerByBib.get(detailBib) : undefined;
  const S = cat ? states.get(cat.id) : undefined;
  const passages = recentPassages(snapshot.runners, now, RECENT_LIMIT);

  return (
    <div className={s.root} data-testid="online-results">
      <header className={s.top}>
        <Link href="/" className={s.brand} title={t("homeTitle")}>
          <div className={s.mark}>V</div>
          <div className={s.bt}>
            MALÁ CENA<span>VELKÉ VERANDY</span>
          </div>
        </Link>
        <h1 className={s.title}>
          {t("title")}
          <small>{t("subtitle", { year: snapshot.year })}</small>
        </h1>
        <div className={s.legend}>
          <span>
            <i className={s["lg-new"]} />
            {t("legendNew")}
          </span>
          <span>{t.rich("legendRank", { b: (c) => <b className={s.lgB}>{c}</b> })}</span>
          <span>{t.rich("legendFin", { b: (c) => <b className={s.lgB}>{c}</b> })}</span>
          <span>{t("legendOn")}</span>
          {records.badges.size ? (
            <span>
              <RecordBadge kind="tr" />
              {t("legendRecord")}
            </span>
          ) : null}
          <span>{t.rich("legendFinal", { ok: (c) => <b className={s.lgOk}>{c}</b> })}</span>
          <span>
            <span className={cx(s.runv, s.num)}>12:34</span> {t("legendRun")}
          </span>
        </div>
        <div className={s.spacer} />
        <div className={cx(s.upd, stale && s.off)} aria-live="off">
          <span className={cx(s.dot, stale && s.off)} />
          {t.rich("updated", { ...tags, time: formatDayTime(Math.floor(updatedMs / 1000)) })}
          <br />
          <span className={s.sub}>{stale ? t("stale") : t("live")}</span>
        </div>
        <div className={cx(s.clock, s.num)}>
          {mobile ? <span className={cx(s.dot, stale && s.off)} /> : null}
          <span suppressHydrationWarning>{formatDayTime(now)}</span>
        </div>
        <button
          type="button"
          className={cx(s.iconbtn, s.fbtn)}
          aria-label={t("followOpen")}
          data-testid="online-follow-open"
          onClick={() => setListOpen(true)}
        >
          <span className={s.fbtnStar}>★</span>
          {followed.list.length ? (
            <span className={cx(s.fcnt, s.num)}>{followed.list.length}</span>
          ) : null}
        </button>
        <button
          type="button"
          className={s.iconbtn}
          aria-label={t("searchOpen")}
          aria-expanded={searchOpen}
          data-testid="online-search-toggle"
          onClick={() => setSearchOpen((open) => !open)}
        >
          <SearchIcon />
        </button>
      </header>
      <nav className={s.tabs} aria-label={t("categories")} ref={tabsRef}>
        <button
          type="button"
          className={cx(s.tab, s.ftab, view?.t === "fol" && s.on)}
          onClick={() => openView({ t: "fol" })}
          aria-current={view?.t === "fol" ? "page" : undefined}
          data-testid="online-tab-follow"
        >
          <span className={s.vs}>★</span>
          {mobile ? null : t("tabFollow")}{" "}
          <span className={cx(s.tc, s.num)}>{followed.list.length}</span>
        </button>
        {shownView?.club ? (
          <span className={cx(s.tab, s.ctab, s.on)} data-testid="online-tab-club">
            <span className={s.vs}>⌂</span>
            {mobile ? shownView.club.id : shownView.club.name}{" "}
            <span className={cx(s.tc, s.num)}>{shownView.count}</span>
            <button
              type="button"
              className={s.vx}
              title={t("closeClub")}
              aria-label={t("closeClub")}
              onClick={closeView}
            >
              ×
            </button>
          </span>
        ) : null}
        {categories.map((c) => tab(c))}
        <button
          type="button"
          className={s.all}
          aria-label={t("allCategories")}
          data-testid="online-menu"
          onClick={() => setSheetOpen(true)}
        >
          <svg viewBox="0 0 24 24" fill="none" strokeWidth="2.4" aria-hidden>
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </nav>
      <div className={cx(s.msearch, searchOpen && s.open)}>
        {searchBox(mobileInputRef)}
        {mobile ? searchResults : null}
      </div>
      <div className={s.wrap}>
        <main>
          {shownView ? (
            shownView.section
          ) : cat && S ? (
            <section className={cx(s.cat, S.done && s.done)} data-testid="online-category">
              <div className={cx(s.ch, cat.sex === "F" && s.f)}>
                <h2>{cat.name}</h2>
                <span className={s.cnt}>
                  {t.rich("count", {
                    ...tags,
                    fin: S.finished,
                    on: S.onCourse,
                    wait: S.waiting.length,
                    dns: S.dns.length,
                  })}
                </span>
                {S.done ? <span className={s.kbadge}>{t("catFinal")}</span> : null}
              </div>
              {renderTable(S)}
            </section>
          ) : null}
        </main>
        <aside className={s.aside}>
          <div className={s.box} data-testid="online-follow-box">
            <h3>
              {t("followTitle")}
              {followed.list.length ? (
                <span className={s.fcount}>
                  {followed.list.length}/{limit}
                </span>
              ) : null}
              <small>{t("followSub")}</small>
            </h3>
            {followList(false)}
            {notifyOption}
          </div>
          <div className={s.box}>
            <h3>
              {t("findTitle")}
              <small>{t("findSub")}</small>
            </h3>
            {mobile ? null : searchBox()}
            {mobile ? null : searchResults}
          </div>
          {shownView ? (
            shownView.summary
          ) : cat && S ? (
            <div className={s.box}>
              <h3>
                {cat.name}
                <small>{t("onList", { count: S.total })}</small>
              </h3>
              <div className={s.stats}>
                <div className={cx(s.stat, s.ok)}>
                  <b className={s.num}>{S.finished}</b>
                  <span>{t("statFin")}</span>
                </div>
                <div className={cx(s.stat, s.run)}>
                  <b className={s.num}>{S.onCourse}</b>
                  <span>{t("statOn")}</span>
                </div>
                <div className={s.stat}>
                  <b className={s.num}>{S.waiting.length}</b>
                  <span>{t("statWait")}</span>
                </div>
                <div className={cx(s.stat, s.gr)}>
                  <b className={s.num}>{S.dns.length}</b>
                  <span>{t("statDns")}</span>
                </div>
              </div>
              {S.firstStart != null && S.lastStart != null ? (
                <p className={s.meta}>
                  {t.rich("starts", {
                    ...tags,
                    from: formatDayTime(S.firstStart),
                    to: formatDayTime(S.lastStart),
                  })}
                  {S.best != null ? t.rich("best", { ...tags, time: formatMinutes(S.best) }) : null}
                </p>
              ) : null}
            </div>
          ) : null}
          <div className={s.box}>
            <h3>
              {t("recentTitle")}
              <small>{t("recentSub")}</small>
            </h3>
            {passages.length ? (
              <table className={s.lp}>
                <colgroup>
                  <col style={{ width: "4.4rem" }} />
                  <col style={{ width: "2.9rem" }} />
                  <col style={{ width: "2.5rem" }} />
                  <col />
                  <col style={{ width: "3rem" }} />
                  <col style={{ width: "3.4rem" }} />
                  <col style={{ width: "2.7rem" }} />
                </colgroup>
                <tbody>
                  {passages.map((p) => {
                    const c = catById.get(p.runner.cat);
                    return (
                      <tr key={`${p.runner.bib}-${p.point}`}>
                        <td className={cx(s.lt, s.num)}>{formatDayTime(p.at)}</td>
                        <td>
                          <span className={cx(s.pt, p.point === "fin" && s.fin)}>
                            {pointLabel(p.point)}
                          </span>
                        </td>
                        <td className={cx(s.bib, s.num)}>{p.runner.bib}</td>
                        <td className={s.nm}>
                          {p.point === "fin" ? (
                            <RecordBadge kind={records.badges.get(p.runner.bib)} />
                          ) : null}
                          {p.runner.name}
                        </td>
                        <td className={s.c}>
                          {c ? (
                            <button type="button" onClick={() => selectCategory(c.slug)}>
                              {c.short}
                            </button>
                          ) : null}
                        </td>
                        <td className={cx(p.point === "fin" ? s.fin : cx(s.t, s.cur), s.num)}>
                          {formatMinutes(p.time)}
                        </td>
                        <td>
                          {p.rank <= 3 ? (
                            <span className={cx(s.medal, s[`m${p.rank}c`])}>{p.rank}.</span>
                          ) : (
                            <span className={s.mx}>{p.rank}.</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p className={s.note}>{t("recentEmpty")}</p>
            )}
          </div>
          <p className={s.note}>
            {t.rich("note", {
              year: snapshot.year,
              link: (c) => <Link href="/vysledky">{c}</Link>,
            })}
          </p>
        </aside>
      </div>
      <footer className={s.footer}>
        {t("copyright")} · <Link href="/">mcvv.org</Link> ·{" "}
        <Link href="/startovka">{t("footerStartlist")}</Link> ·{" "}
        <Link href="/pokyny">{t("footerInstructions")}</Link>
      </footer>
      {sheetOpen ? (
        <div
          className={cx(s.sheet, s.open)}
          role="dialog"
          aria-modal="true"
          aria-label={t("categories")}
          onClick={(e) => {
            if (e.target === e.currentTarget) setSheetOpen(false);
          }}
        >
          <div className={s.in}>
            <h4>
              {t("categories")}
              <button type="button" onClick={() => setSheetOpen(false)}>
                {t("close")}
              </button>
            </h4>
            <div className={s.grid}>
              <button
                type="button"
                className={cx(s.tab, s.ftab)}
                onClick={() => openView({ t: "fol" })}
              >
                <span>
                  <span className={s.vs}>★</span> {t("tabFollow")}
                </span>
                <span className={cx(s.tc, s.num)}>
                  {followed.list.length}/{limit}
                </span>
              </button>
              {categories.map((c) => tab(c, true))}
            </div>
          </div>
        </div>
      ) : null}
      {detailRunner || listOpen ? (
        <div
          className={s.fsheet}
          role="dialog"
          aria-modal="true"
          aria-label={detailRunner ? t("detailTitle") : t("followSheetTitle")}
          data-testid={detailRunner ? "online-runner-detail" : "online-follow-sheet"}
          onClick={(e) => {
            if (e.target === e.currentTarget) closeSheets();
          }}
        >
          <div className={s.fpanel}>
            {detailRunner ? (
              renderDetail(detailRunner)
            ) : (
              <>
                <h4>
                  {t("followSheetTitle")}
                  <button type="button" onClick={closeSheets}>
                    {t("close")}
                  </button>
                </h4>
                {followList(true)}
                {notifyOption}
              </>
            )}
          </div>
        </div>
      ) : null}
      <div
        className={cx(s.ftoasts, freeze && s.frozen)}
        aria-live="polite"
        data-testid="online-follow-toasts"
      >
        {alerts.toasts.map((toast) => (
          <div
            key={toast.id}
            role="status"
            className={cx(
              s.ft,
              toast.kind === "fin" && s.ftFin,
              toast.kind === "final" && s.ftFinal,
              toast.kind === "info" && s.ftInfo,
            )}
          >
            {toastBody(toast)}
            <button
              type="button"
              className={s.ftx}
              aria-label={t("toastClose")}
              onClick={() => alerts.dismiss(toast.id)}
            >
              ×
            </button>
            <i
              className={s.ftbar}
              style={{ animationDuration: `${FOLLOW_TOAST_MS[toast.kind]}ms` }}
            />
          </div>
        ))}
      </div>
      <RecordOverlay
        batch={records.batch}
        mode="online"
        runner={(bib) => snapshot.runners.find((r) => r.bib === bib)}
        catName={(id) => catById.get(id)?.name ?? id}
      />
    </div>
  );
}
