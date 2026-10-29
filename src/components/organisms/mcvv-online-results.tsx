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

import { RecordBadge, RecordOverlay } from "@/components/molecules/record-alert";
import { useLiveSnapshot } from "@/hooks/use-live-snapshot";
import { useRecordAlerts } from "@/hooks/use-record-alerts";
import { useTrDemo } from "@/hooks/use-tr-demo";
import { Link } from "@/i18n/routing";
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

  const selectCategory = useCallback(
    (next: string, scroll = true) => {
      setSlug(next);
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
  useEffect(() => {
    if (chosen !== null || !remembered) return;
    const found = findCategoryBySlug(categories, remembered);
    if (found) window.history.replaceState(null, "", `/${locale}/vysledky/online/${found.slug}`);
  }, [chosen, remembered, categories, locale]);

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
      {hits.length ? (
        hits.map((r) => (
          <button
            type="button"
            key={r.bib}
            className={s.it}
            onClick={() => pickRunner(r)}
            data-testid="online-search-hit"
          >
            <span className={cx(s.b, s.num)}>{r.bib}</span>
            <span className={s.n}>
              {renderName(r.name)}
              <small>{cap(catById.get(r.cat)?.name ?? r.cat)}</small>
            </span>
            <span className={s.s}>{statusText(r)}</span>
          </button>
        ))
      ) : (
        <div className={s.none}>{t("searchNone")}</div>
      )}
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
        className={cx(s.tab, c.slug === cat?.slug && s.on, !inSheet && st.done && s.done)}
        onClick={() => selectCategory(c.slug)}
        aria-current={c.slug === cat?.slug ? "page" : undefined}
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
          )}
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
                    className={cx(s.r, s.w, flashBib === r.bib && s.flash)}
                  >
                    <td className={s.rk} />
                    <td className={cx(s.bib, s.num)}>{r.bib}</td>
                    <td className={s.nm}>
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
                  className={cx(s.r, s.dnsr, flashBib === r.bib && s.flash)}
                >
                  <td className={s.rk} />
                  <td className={cx(s.bib, s.num)}>{r.bib}</td>
                  <td className={s.nm}>
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
          {cat && S ? (
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
          <div className={s.box}>
            <h3>
              {t("findTitle")}
              <small>{t("findSub")}</small>
            </h3>
            {mobile ? null : searchBox()}
            {mobile ? null : searchResults}
          </div>
          {cat && S ? (
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
            <div className={s.grid}>{categories.map((c) => tab(c, true))}</div>
          </div>
        </div>
      ) : null}
      <RecordOverlay
        batch={records.batch}
        mode="online"
        runner={(bib) => snapshot.runners.find((r) => r.bib === bib)}
        catName={(id) => catById.get(id)?.name ?? id}
      />
    </div>
  );
}
