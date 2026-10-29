"use client";

import { useTranslations } from "next-intl";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import {
  LeaderBanner,
  LeaderChip,
  leaderBoxClass,
  leaderStyles,
} from "@/components/molecules/leader-alert";
import { useLeaderAlerts } from "@/hooks/use-leader-alerts";
import { useLiveSnapshot } from "@/hooks/use-live-snapshot";
import { useResultboardInfo } from "@/hooks/use-resultboard-info";
import { leaderPassages } from "@/lib/live/leader-core";
import type { ResultboardInfo } from "@/lib/live/resultboard";
import {
  buildSearchIndex,
  byCategory,
  categoryState,
  formatDayTime,
  formatMinutes,
  highlightRanges,
  lastPoint,
  nextPoint,
  POINTS,
  rankAt,
  recentPassages,
  runnerStatus,
  searchRunners,
  type PointKey,
  type SpeakerRunner,
  type SpeakerSnapshot,
} from "@/lib/live/speaker-core";

import s from "./mcvv-speaker-screen.module.css";

type Props = Readonly<{
  initial: SpeakerSnapshot;
  initialEtag: string;
  /** Čas serveru při vykreslení – první render klienta je tak shodný se serverem. */
  serverNowMs: number;
  /** Nastavení upozornění „nový lídr“ (sdílené s resultboardem, obnovuje se po 30 s). */
  initialInfo: ResultboardInfo;
  initialInfoEtag: string;
}>;

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");
const u = (rem: number) => `calc(${rem} * var(--u))`;

/**
 * Celoobrazovková obrazovka pro speakera (#188): 13 kategorií (top 10 společného seznamu),
 * poslední průchody a vyhledání běžce. Data chodí jednou za 5 s (304, když se nic nezměnilo);
 * pořadí, ✓, běžící časy a virtuální pořadí se přepočítávají každou sekundu na klientu.
 */
export function McvvSpeakerScreen({
  initial,
  initialEtag,
  serverNowMs,
  initialInfo,
  initialInfoEtag,
}: Props) {
  const t = useTranslations("Speaker");
  const { snapshot, nowMs, updatedMs, stale } = useLiveSnapshot(
    "/api/live/speaker",
    initial,
    initialEtag,
    serverNowMs,
  );
  const { config } = useResultboardInfo(initialInfo, initialInfoEtag);
  const leaderPoints = config.leader.points;
  const alerts = useLeaderAlerts({
    runners: snapshot.runners,
    updatedMs,
    nowMs,
    resetKey: `${snapshot.year}|${snapshot.test}|${leaderPoints.join()}`,
    points: leaderPoints,
    enabled: config.leader.speaker,
  });
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(0);
  const [cardBib, setCardBib] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const now = Math.floor(nowMs / 1000);
  const grouped = useMemo(() => byCategory(snapshot.runners), [snapshot]);
  const catById = useMemo(
    () => new Map(snapshot.categories.map((c) => [c.id, c])),
    [snapshot.categories],
  );
  const index = useMemo(() => buildSearchIndex(snapshot.runners), [snapshot.runners]);
  const results = useMemo(() => searchRunners(index, query), [index, query]);
  const card = cardBib === null ? null : (snapshot.runners.find((r) => r.bib === cardBib) ?? null);
  const pointLabel = (k: PointKey) =>
    k === "m1" ? t("pointM1") : k === "m2" ? t("pointM2") : t("pointFin");

  const openCard = (r: SpeakerRunner) => {
    setCardBib(r.bib);
    inputRef.current?.blur();
  };
  const closeCard = useCallback(() => {
    setCardBib(null);
    setQuery("");
    setSel(0);
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (cardBib !== null) cardRef.current?.focus();
  }, [cardBib]);

  // Enter/Esc na kartě → zpět do hledání; psaní kdekoli → do hledání
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (cardBib !== null && (e.key === "Enter" || e.key === "Escape")) {
        e.preventDefault();
        e.stopPropagation();
        closeCard();
      } else if (
        cardBib === null &&
        document.activeElement !== inputRef.current &&
        e.key.length === 1 &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        inputRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [cardBib, closeCard]);

  const timeCells = (r: SpeakerRunner, hit: boolean) => {
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
            <span className={s.runv}>{formatMinutes(now - r.start)}</span>
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

  const tags = {
    b: (chunks: ReactNode) => <b>{chunks}</b>,
    ok: (chunks: ReactNode) => <span className={s.okc}>{chunks}</span>,
  };

  const statusShort = (r: SpeakerRunner) => {
    const st = runnerStatus(r, grouped.get(r.cat) ?? [], now);
    if (st.kind === "before-start") return t("acBefore", { time: formatDayTime(st.start) });
    if (st.kind === "finished") return t("acFinished", { rank: st.rank });
    if (st.last) {
      return t("acOnCourseAt", { point: pointLabel(st.last.point), rank: st.last.rank });
    }
    return t("acOnCourse");
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

  const renderCard = (r: SpeakerRunner) => {
    const catRunners = grouped.get(r.cat) ?? [];
    const cat = catById.get(r.cat);
    const state = categoryState(catRunners, now);
    const st = runnerStatus(r, catRunners, now);
    const sex = cat?.sex === "F" ? "F" : "M";
    let badge: ReactNode;
    let big: ReactNode;
    if (st.kind === "before-start") {
      badge = <span className={cx(s.cSt, s.stNs)}>{t("stBefore")}</span>;
      big = (
        <>
          <div className={s.lbl}>{t("cardStartLabel")}</div>
          <div className={cx(s.val, s.num)}>{formatDayTime(st.start)}</div>
          <div className={s.sub}>{t("cardStartIn", { in: formatMinutes(st.inS) })}</div>
        </>
      );
    } else if (st.kind === "finished") {
      badge = <span className={cx(s.cSt, s.stFin)}>{t("stFinished")}</span>;
      big = (
        <>
          <div className={s.lbl}>{t("cardFinLabel")}</div>
          <div className={cx(s.val, s.num)} data-testid="card-rank">
            {st.rank}.<small>{t("cardPlaceWord")}</small> {formatMinutes(st.time)}
          </div>
          <div className={s.sub}>{st.final ? t.rich("cardFinal", tags) : t("cardProvisional")}</div>
        </>
      );
    } else {
      badge = <span className={cx(s.cSt, s.stOn)}>{t("stOnCourse")}</span>;
      big = (
        <>
          <div className={s.lbl}>{t("cardRunLabel")}</div>
          <div className={cx(s.val, s.runc, s.num)}>▸ {formatMinutes(st.live)}</div>
          <div className={s.sub}>
            {st.last
              ? t.rich("cardLastSplit", {
                  ...tags,
                  point: pointLabel(st.last.point),
                  time: formatMinutes(st.last.time),
                  rank: st.last.rank,
                  next: pointLabel(st.next),
                })
              : t("cardNoSplit", { next: pointLabel(st.next) })}
          </div>
          <div className={s.virt} data-testid="card-virtual">
            {t.rich("cardVirtual", { ...tags, rank: st.virtualRank, sex })}
          </div>
        </>
      );
    }
    const next = nextPoint(r);
    const pts = POINTS.map((k) => {
      const value = r[k];
      if (value != null) {
        return (
          <div key={k} className={s.cPt}>
            <span className={s.k}>{pointLabel(k)}</span>
            <span className={cx(s.v, s.num)}>{formatMinutes(value)}</span>
            <span className={s.r}>
              {k === "fin" && st.kind === "finished"
                ? t.rich("ptPlace", { ...tags, rank: st.rank, point: pointLabel(k) })
                : t.rich("ptPlace", {
                    ...tags,
                    rank: rankAt(catRunners, k, value),
                    point: pointLabel(k),
                  })}
            </span>
          </div>
        );
      }
      if (k === next && st.kind === "on-course") {
        return (
          <div key={k} className={s.cPt}>
            <span className={s.k}>{pointLabel(k)}</span>
            <span className={cx(s.v, s.num)}>
              <span className={s.runv}>{formatMinutes(st.live)}</span>
            </span>
            <span className={s.r}>
              {k === "fin"
                ? t.rich("ptVirtual", { ...tags, rank: st.virtualRank, sex })
                : t("ptWaiting")}
            </span>
          </div>
        );
      }
      return (
        <div key={k} className={cx(s.cPt, s.ptNone)}>
          <span className={s.k}>{pointLabel(k)}</span>
          <span className={s.v}>–</span>
          <span className={s.r} />
        </div>
      );
    });
    return (
      <div
        ref={cardRef}
        className={s.card}
        tabIndex={-1}
        role="dialog"
        aria-label={r.name}
        data-testid="speaker-card"
      >
        <div className={s.cTop}>
          <span className={cx(s.cBibb, s.num)}>{r.bib}</span>
          <span className={s.cName}>{r.name}</span>
          {badge}
        </div>
        <div className={s.cCat}>
          {t.rich("cardCat", {
            ...tags,
            cat: cat?.name ?? r.cat,
            fin: state.finished,
            on: state.onCourse,
          })}
        </div>
        <div className={s.cMain}>
          <div className={s.cBig}>{big}</div>
          <div className={s.cPts}>{pts}</div>
        </div>
        <div className={s.cFoot}>{t.rich("cardFoot", { k: (c) => <kbd>{c}</kbd> })}</div>
      </div>
    );
  };

  const passages = recentPassages(snapshot.runners, now);
  const stars = leaderPassages(passages, snapshot.runners);

  return (
    <div className={cx(s.root, snapshot.test && s.test)} data-testid="speaker-screen">
      <header className={s.hdr}>
        <div className={s.brand}>
          <div className={s.mark}>{t("brandMark")}</div>
          <div className={s.bt}>
            {t("brandTop")}
            <span>{t("brandBottom")}</span>
          </div>
        </div>
        <h1 className={s.title}>{t("title")}</h1>
        <div className={s.legend}>
          <span>
            <i className={s.lgNew} />
            {t("legendNew")}
          </span>
          {config.leader.speaker ? (
            <span>
              <i className={s.lgLead} />
              <b className={leaderStyles.star}>★</b> {t("legendLeader")}
            </span>
          ) : null}
          <span>{t.rich("legendRank", { b: (c) => <b className={s.lgB}>{c}</b> })}</span>
          <span>
            <b className={s.lgMuted}>{t("legendOnWord")}</b>
            {t("legendOn")}
          </span>
          <span>
            {t.rich("legendCatFinal", { badge: (c) => <span className={s.kbadge}>{c}</span> })}
          </span>
          <span>{t.rich("legendFinal", { ok: (c) => <b className={s.lgOk}>{c}</b> })}</span>
          <span>
            <span className={cx(s.runv, s.num)}>12:34</span>
            {t("legendRun")}
          </span>
        </div>
        <div className={s.spacer} />
        {snapshot.test ? (
          <div className={s.testbadge} data-testid="speaker-test">
            {t("testBadge")}
            <small>{t("testNote")}</small>
          </div>
        ) : null}
        <div className={cx(s.upd, stale && s.stale)} aria-live="polite">
          <span className={s.dot} />
          {t.rich("updated", {
            b: (c) => <b className={s.num}>{c}</b>,
            time: formatDayTime(Math.floor(updatedMs / 1000)),
          })}
          <br />
          <span className={s.sub}>{stale ? t("stale") : t("live")}</span>
        </div>
        <div className={cx(s.clock, s.num)} suppressHydrationWarning>
          {formatDayTime(now)}
        </div>
      </header>
      <main className={s.grid}>
        {snapshot.categories.map((c) => {
          const state = categoryState(grouped.get(c.id) ?? [], now);
          const count =
            state.done && state.onCourse === 0
              ? t.rich("countDone", { ...tags, fin: state.finished })
              : t.rich("count", { ...tags, fin: state.finished, on: state.onCourse });
          const alert = alerts.get(c.id);
          return (
            <section
              key={c.id}
              className={cx(s.cat, state.done && s.done, leaderBoxClass(alert, nowMs))}
              data-testid={`speaker-cat-${c.id}`}
              data-lead={alert ? alert.point : undefined}
            >
              <div className={cx(s.ch, c.sex === "F" && s.f, state.done && s.done)}>
                <h2>{c.name}</h2>
                <span className={s.cnt}>{count}</span>
                {alert ? (
                  <LeaderChip alert={alert} />
                ) : state.done ? (
                  <span className={s.kbadge}>{t("catFinal")}</span>
                ) : null}
              </div>
              {state.shown.length ? (
                <table>
                  <colgroup>
                    <col className={s.cRk} />
                    <col className={s.cBib} />
                    <col />
                    <col className={s.cT} />
                    <col className={s.cT} />
                    <col className={s.cF} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th>{t("colRank")}</th>
                      <th>{t("colBib")}</th>
                      <th className={s.nmh}>{t("colName")}</th>
                      <th>{t("colM1")}</th>
                      <th>{t("colM2")}</th>
                      <th>{t("colFin")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {state.shown.map((row) => (
                      <tr
                        key={row.runner.bib}
                        className={cx(
                          s.r,
                          row.recent && s.new,
                          row.final && s.final,
                          row.rank === null && s.on,
                          alert?.bib === row.runner.bib && leaderStyles.row,
                        )}
                      >
                        <td className={cx(s.rk, s.num)}>
                          {row.rank !== null ? (
                            <>
                              {row.final ? <span className={s.okc}>✓</span> : null}
                              {row.rank}.
                            </>
                          ) : null}
                        </td>
                        <td className={cx(s.bib, s.num)}>{row.runner.bib}</td>
                        <td className={s.nm} title={row.runner.name}>
                          {row.runner.name}
                        </td>
                        {timeCells(row.runner, row.recent)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className={s.empty}>{t("catEmpty")}</div>
              )}
              {alert ? <LeaderBanner alert={alert} /> : null}
            </section>
          );
        })}
        <section className={s.last}>
          <div className={s.ch}>
            <h2>{t("recentTitle")}</h2>
            <span className={s.cnt}>
              {t("recentNote")}
              {config.leader.speaker ? (
                <>
                  {" · "}
                  <b className={leaderStyles.star}>★</b> {t("recentLeader")}
                </>
              ) : null}
            </span>
          </div>
          <div className={s.recentBox} data-testid="speaker-recent">
            {passages.length ? (
              <table>
                <colgroup>
                  <col style={{ width: u(4.9) }} />
                  <col style={{ width: u(3) }} />
                  <col style={{ width: u(2.6) }} />
                  <col />
                  <col style={{ width: u(8.6) }} />
                  <col style={{ width: u(3.3) }} />
                  <col style={{ width: u(3.2) }} />
                </colgroup>
                <thead>
                  <tr>
                    <th className={s.l}>{t("colAt")}</th>
                    <th>{t("colPoint")}</th>
                    <th>{t("colBib")}</th>
                    <th className={s.nmh}>{t("colName")}</th>
                    <th className={s.l}>{t("colCat")}</th>
                    <th>{t("colTime")}</th>
                    <th>{t("colRank")}</th>
                  </tr>
                </thead>
                <tbody>
                  {passages.map((p) => (
                    <tr key={`${p.runner.bib}-${p.point}`} className={s.r}>
                      <td className={cx(s.lt, s.num)}>{formatDayTime(p.at)}</td>
                      <td>
                        <span className={cx(s.pt, p.point === "fin" && s.ptFin)}>
                          {pointLabel(p.point).toUpperCase()}
                        </span>
                      </td>
                      <td className={cx(s.bib, s.num)}>{p.runner.bib}</td>
                      <td className={s.nm}>
                        {config.leader.speaker && stars.has(`${p.runner.bib}|${p.point}`) ? (
                          <b className={leaderStyles.star} data-testid="speaker-recent-leader">
                            ★{" "}
                          </b>
                        ) : null}
                        {p.runner.name}
                      </td>
                      <td className={s.lt}>{catById.get(p.runner.cat)?.name ?? p.runner.cat}</td>
                      <td className={cx(p.point === "fin" ? s.fin : cx(s.t, s.cur), s.num)}>
                        {formatMinutes(p.time)}
                      </td>
                      <td>
                        <span
                          className={
                            p.rank <= 3
                              ? cx(s.medal, p.rank === 1 ? s.m1c : p.rank === 2 ? s.m2c : s.m3c)
                              : s.mx
                          }
                        >
                          {p.rank}.
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className={s.recentEmpty}>{t("recentEmpty")}</p>
            )}
          </div>
          <div className={s.search}>
            {query.trim() && cardBib === null ? (
              <div className={s.ac} role="listbox" data-testid="speaker-ac">
                {results.length ? (
                  results.map((r, i) => (
                    <div
                      key={r.bib}
                      role="option"
                      aria-selected={i === sel}
                      className={cx(s.it, i === sel && s.sel)}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        openCard(r);
                      }}
                    >
                      <span className={cx(s.b, s.num)}>{r.bib}</span>
                      <span className={s.n}>{renderName(r.name)}</span>
                      <span className={s.c}>{catById.get(r.cat)?.name ?? r.cat}</span>
                      <span className={s.s}>{statusShort(r)}</span>
                    </div>
                  ))
                ) : (
                  <div className={s.none}>{t("searchNone")}</div>
                )}
              </div>
            ) : null}
            <div className={s.sbox}>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                strokeWidth="2.4"
                strokeLinecap="round"
                aria-hidden
              >
                <circle cx="10.5" cy="10.5" r="6.5" />
                <path d="M20 20l-4.8-4.8" />
              </svg>
              <input
                ref={inputRef}
                className={s.q}
                value={query}
                // obrazovka speakera: hledání je hlavní ovládací prvek, fokus hned po načtení
                autoFocus
                autoComplete="off"
                spellCheck={false}
                aria-label={t("searchLabel")}
                placeholder={t("searchPlaceholder")}
                data-testid="speaker-search"
                onChange={(e) => {
                  setQuery(e.target.value);
                  setSel(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    setSel((v) => Math.min(v + 1, Math.max(results.length - 1, 0)));
                    e.preventDefault();
                  } else if (e.key === "ArrowUp") {
                    setSel((v) => Math.max(v - 1, 0));
                    e.preventDefault();
                  } else if (e.key === "Enter") {
                    const r = results[sel];
                    if (r) openCard(r);
                    e.preventDefault();
                  } else if (e.key === "Escape") {
                    setQuery("");
                    setSel(0);
                  }
                }}
              />
              <span className={s.hint}>{t.rich("searchHint", { k: (c) => <kbd>{c}</kbd> })}</span>
            </div>
          </div>
          {card ? renderCard(card) : null}
        </section>
      </main>
    </div>
  );
}
