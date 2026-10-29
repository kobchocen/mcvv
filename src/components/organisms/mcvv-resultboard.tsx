"use client";

import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import {
  LeaderBanner,
  LeaderChip,
  leaderBoxClass,
  leaderStyles,
} from "@/components/molecules/leader-alert";
import { useLeaderAlerts } from "@/hooks/use-leader-alerts";
import { useLiveSnapshot } from "@/hooks/use-live-snapshot";
import { useResultboardInfo } from "@/hooks/use-resultboard-info";
import type { LeaderAlert } from "@/lib/live/leader-core";
import {
  decodeOnline,
  onlineCategoryState,
  type OnlineCategory,
  type OnlineRunner,
  type OnlineWire,
} from "@/lib/live/online-results-core";
import type { ResultboardInfo } from "@/lib/live/resultboard";
import {
  RESULTBOARD_AUTO_COLUMNS,
  boardItems,
  layoutColumns,
  monitorCategories,
  partnerGroups,
  shouldReload,
  stepScroll,
  type BoardItem,
  type ResultboardConfig,
  type ScrollState,
} from "@/lib/live/resultboard-core";
import {
  byCategory,
  formatDayTime,
  formatMinutes,
  lastPoint,
  nextPoint,
  POINTS,
} from "@/lib/live/speaker-core";

import s from "./mcvv-resultboard.module.css";

type Props = Readonly<{
  tv: number;
  initial: OnlineWire;
  initialEtag: string;
  serverNowMs: number;
  initialInfo: ResultboardInfo;
  initialInfoEtag: string;
  /** `?test=1` pro přihlášené – data včetně testu z `/api/live/resultboard/test`. */
  test: boolean;
  /** QR kód na `/vysledky/online` (SVG vygenerované na serveru) a text pod ním. */
  qrSvg: string;
  qrLabel: string;
}>;

const cx = (...names: (string | false | null | undefined)[]) => names.filter(Boolean).join(" ");

type Item = BoardItem;

/**
 * Resultboard `/resultboard/<n>` (Q144) – kompletní průběžné výsledky kategorií jedné TV
 * v cíli. Data = veřejný snímek `/api/live/results` (stejná cache a ETag jako
 * `/vysledky/online`), nastavení a partneři z `/api/live/resultboard` (po 30 s).
 */
export function McvvResultboard(props: Props) {
  const t = useTranslations("Resultboard");
  const {
    snapshot: wire,
    nowMs,
    updatedMs,
    stale,
  } = useLiveSnapshot<OnlineWire>(
    props.test ? "/api/live/resultboard/test" : "/api/live/results",
    props.initial,
    props.initialEtag,
    props.serverNowMs,
  );
  const info = useResultboardInfo(props.initialInfo, props.initialInfoEtag);
  const { config } = info;
  const data = useMemo(() => decodeOnline(wire), [wire]);
  const grouped = useMemo(() => byCategory(data.runners), [data]);
  const now = Math.floor(nowMs / 1000);
  const monitor = config.monitors[props.tv - 1] ?? null;
  const cats = useMemo(
    () => monitorCategories(config, data.categories, props.tv),
    [config, data.categories, props.tv],
  );
  const columns = useMemo(
    () =>
      layoutColumns(
        cats,
        (c) => grouped.get(c.id)?.length ?? 0,
        monitor?.columns ?? RESULTBOARD_AUTO_COLUMNS,
      ),
    [cats, grouped, monitor],
  );
  const points = config.leader.points;
  const alerts = useLeaderAlerts({
    runners: data.runners,
    updatedMs,
    nowMs,
    resetKey: `${data.year}|${props.test}|${points.join()}`,
    points,
    enabled: config.leader.resultboard,
  });

  useAutoReload(info.build, props.initialInfo.build, stale);

  return (
    <div className={cx(s.root, props.test && s.test)} data-testid="resultboard">
      <header className={s.hdr}>
        <div className={s.brand}>
          <div className={s.mark}>{t("brandMark")}</div>
          <div className={s.bt}>
            {t("brandTop")}
            <span>{t("brandBottom")}</span>
          </div>
        </div>
        <div className={s.title}>
          {t("title")}
          <small>{t("subtitle")}</small>
        </div>
        <div className={s.mon} data-testid="resultboard-monitor">
          {t.rich("monitor", {
            b: (c) => <b>{c}</b>,
            n: props.tv,
            total: config.monitors.length,
            name: monitor?.name ?? "–",
          })}
        </div>
        <div className={s.legend}>
          <span>
            <i className={s.lgNew} />
            {t("legendNew")}
          </span>
          {config.leader.resultboard ? (
            <span>
              <i className={s.lgLead} />
              <b className={leaderStyles.star}>★</b> {t("legendLeader")}
            </span>
          ) : null}
          <span>{t.rich("legendRank", { b: (c) => <b className={s.lgB}>{c}</b> })}</span>
          <span>{t.rich("legendFinal", { ok: (c) => <b className={s.lgOk}>{c}</b> })}</span>
          <span>
            <span className={cx(s.runv, s.num)}>12:34</span>
            {t("legendRun")}
          </span>
          <span>
            {t.rich("legendScroll", {
              i: (c) => <b className={s.lgRun}>{c}</b>,
              n: config.fixedTop,
            })}
          </span>
        </div>
        <div className={s.spacer} />
        {props.test ? (
          <div className={s.testbadge} data-testid="resultboard-test">
            {t("testBadge")}
            <small>{t("testNote")}</small>
          </div>
        ) : null}
        <div
          className={cx(s.upd, stale && s.stale)}
          aria-live="polite"
          data-testid="resultboard-upd"
        >
          <span className={s.dot} />
          {t.rich(stale ? "staleSince" : "updated", {
            b: (c) => <b className={s.num}>{c}</b>,
            time: formatDayTime(Math.floor(updatedMs / 1000)),
          })}
          <br />
          <span className={s.sub}>{stale ? t("staleNote") : t("live")}</span>
        </div>
        <div className={cx(s.clock, s.num)} suppressHydrationWarning>
          {formatDayTime(now)}
        </div>
      </header>
      {!monitor ? (
        <div className={s.missing} data-testid="resultboard-missing">
          <div>
            <b>{t("missingTitle", { n: props.tv })}</b>
            {t("missingNote", { total: config.monitors.length })}
          </div>
        </div>
      ) : cats.length === 0 ? (
        <div className={s.missing}>
          <div>
            <b>{t("noCategoriesTitle")}</b>
            {t("noCategoriesNote")}
          </div>
        </div>
      ) : (
        <main className={s.cols}>
          {columns.map((col) => (
            <div key={col.map((c) => c.id).join()} className={s.col}>
              {col.map((c) => (
                <CategoryBox
                  key={c.id}
                  category={c}
                  runners={grouped.get(c.id) ?? []}
                  now={now}
                  nowMs={nowMs}
                  graceS={data.dnsGraceS}
                  config={config}
                  alert={alerts.get(c.id)}
                />
              ))}
            </div>
          ))}
        </main>
      )}
      {config.partners.show ? (
        <PartnerBar info={info} qrSvg={props.qrSvg} qrLabel={props.qrLabel} />
      ) : null}
    </div>
  );
}

function CategoryBox({
  category: c,
  runners,
  now,
  nowMs,
  graceS,
  config,
  alert,
}: Readonly<{
  category: OnlineCategory;
  runners: OnlineRunner[];
  now: number;
  nowMs: number;
  graceS: number;
  config: ResultboardConfig;
  alert: LeaderAlert | undefined;
}>) {
  const t = useTranslations("Resultboard");
  const state = onlineCategoryState(runners, now, graceS);
  const items = boardItems(state, config);
  // pevně nahoře prvních N řádků výsledků (bez oddělovačů), zbytek do posuvného okna
  let cut = items.length;
  let n = 0;
  for (let i = 0; i < items.length; i += 1) {
    if (items[i].kind !== "div" && ++n === config.fixedTop) {
      cut = i + 1;
      break;
    }
  }
  const leaderBib = alert?.bib ?? null;

  const render = (list: Item[]) => {
    let zi = 0;
    return list.map((it) => {
      if (it.kind === "div") {
        zi = 0;
        return (
          <tr
            key={`div-${it.variant}`}
            className={cx(s.div, it.variant === "wait" && s.wait, it.variant === "dns" && s.dnsd)}
          >
            <td colSpan={6}>
              <div>
                {it.variant === "run"
                  ? t("divRunning")
                  : it.variant === "wait"
                    ? t("divWaiting")
                    : t("divDns")}{" "}
                <b>{it.n}</b>
              </div>
            </td>
          </tr>
        );
      }
      const z = zi++ % 2 === 1;
      if (it.kind === "wait" || it.kind === "dns") {
        return (
          <tr key={it.runner.bib} className={cx(s.r, it.kind === "wait" ? s.w : s.dnsr, z && s.z)}>
            <td className={s.rk} />
            <td className={cx(s.bib, s.num)}>{it.runner.bib}</td>
            <td className={s.nm}>{it.runner.name}</td>
            <td className={s.ws} colSpan={3}>
              {it.kind === "wait" ? (
                t.rich("waitStart", {
                  b: (ch) => <b className={s.num}>{ch}</b>,
                  time: formatDayTime(it.runner.start),
                })
              ) : (
                <span className={s.chip}>{t("dnsChip")}</span>
              )}
            </td>
          </tr>
        );
      }
      const { row } = it;
      const r = row.runner;
      const isLeader = leaderBib === r.bib;
      return (
        <tr
          key={r.bib}
          className={cx(
            s.r,
            z && s.z,
            row.recent && s.new,
            row.final && s.final,
            row.rank === null && s.on,
            isLeader && s.ldr,
            isLeader && leaderStyles.row,
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
          <td className={cx(s.bib, s.num)}>{r.bib}</td>
          <td className={s.nm}>{r.name}</td>
          {timeCells(r, row.recent || isLeader, now)}
        </tr>
      );
    });
  };

  const fixed = items.slice(0, cut);
  const rest = items.slice(cut);
  const count: ReactNode =
    state.done && state.onCourse === 0
      ? t.rich("countDone", { b: (ch) => <b>{ch}</b>, fin: state.finished, total: state.total })
      : t.rich("count", {
          b: (ch) => <b>{ch}</b>,
          fin: state.finished,
          total: state.total,
          on: state.onCourse,
        });
  const cols = (
    <colgroup>
      <col className={s.cRk} />
      <col className={s.cBib} />
      <col />
      <col className={s.cT} />
      <col className={s.cT} />
      <col className={s.cF} />
    </colgroup>
  );
  return (
    <section
      className={cx(s.cat, state.done && s.done, leaderBoxClass(alert, nowMs))}
      style={{ flexGrow: runners.length + 3 }}
      data-testid={`resultboard-cat-${c.id}`}
      data-lead={alert ? alert.point : undefined}
    >
      <div className={cx(s.ch, c.sex === "F" && s.f)}>
        <h2>{c.name}</h2>
        <span className={s.cnt}>
          <span className={s.rollc}>↕ </span>
          {count}
        </span>
        {alert ? (
          <LeaderChip alert={alert} />
        ) : state.done ? (
          <span className={s.kbadge}>{t("catFinal")}</span>
        ) : null}
      </div>
      <table className={s.tf}>
        {cols}
        <thead>
          <tr>
            <th>{t("colRank")}</th>
            <th>{t("colBib")}</th>
            <th className={s.l}>{t("colName")}</th>
            <th>{t("colM1")}</th>
            <th>{t("colM2")}</th>
            <th>{t("colFin")}</th>
          </tr>
        </thead>
        <tbody>
          {fixed.length ? (
            render(fixed)
          ) : (
            <tr>
              <td colSpan={6} className={s.empty}>
                {t("catEmpty")}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <ScrollWindow config={config}>
        <table>
          {cols}
          <tbody>{render(rest)}</tbody>
        </table>
      </ScrollWindow>
      {alert ? <LeaderBanner alert={alert} /> : null}
    </section>
  );
}

function timeCells(r: OnlineRunner, hit: boolean, now: number) {
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
    if (k === next && now >= r.start && (r.started || cur !== null)) {
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
}

/**
 * Posuvné okno pod pevnou špičkou: pomalu nahoru a dolů (ping-pong) s pauzou na koncích.
 * Pozici mění přímo v DOM (requestAnimationFrame), React se při posunu nepřekresluje.
 */
function ScrollWindow({
  config,
  children,
}: Readonly<{ config: ResultboardConfig; children: ReactNode }>) {
  const winRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const thumbRef = useRef<HTMLElement>(null);
  const { scrollRowsPerS, scrollPauseS } = config;

  useEffect(() => {
    const win = winRef.current;
    const inner = innerRef.current;
    const thumb = thumbRef.current;
    const section = win?.closest("section");
    if (!win || !inner || !thumb || !section) return;
    let st: ScrollState = { pos: 0, dir: 1, hold: scrollPauseS };
    let max = 0;
    let rolls = false;
    const measure = () => {
      max = Math.max(0, inner.offsetHeight - win.clientHeight);
      const next = max > 2;
      if (next !== rolls) {
        rolls = next;
        section.toggleAttribute("data-rolls", rolls);
      }
      const h = inner.offsetHeight ? Math.min(1, win.clientHeight / inner.offsetHeight) : 1;
      thumb.style.height = `${h * 100}%`;
    };
    const ro = new ResizeObserver(measure);
    ro.observe(win);
    ro.observe(inner);
    measure();
    let last: number | null = null;
    let frame = 0;
    const loop = (ts: number) => {
      const dt = last === null ? 0 : Math.min(0.1, (ts - last) / 1000);
      last = ts;
      // řádek = 1,55 --u, --u = 1/120 šířky okna
      const rowPx = (window.innerWidth / 120) * 1.55;
      st = rolls
        ? stepScroll(st, dt, max, scrollRowsPerS * rowPx, scrollPauseS)
        : { pos: 0, dir: 1, hold: scrollPauseS };
      inner.style.transform = `translateY(${-st.pos}px)`;
      const h = inner.offsetHeight ? Math.min(1, win.clientHeight / inner.offsetHeight) : 1;
      thumb.style.top = `${max ? (st.pos / max) * (1 - h) * 100 : 0}%`;
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
    };
  }, [scrollRowsPerS, scrollPauseS]);

  return (
    <div ref={winRef} className={s.sw}>
      <div ref={innerRef} className={s.si}>
        {children}
      </div>
      <div className={s.sbar}>
        <i ref={thumbRef} />
      </div>
    </div>
  );
}

function PartnerBar({
  info,
  qrSvg,
  qrLabel,
}: Readonly<{ info: ResultboardInfo; qrSvg: string; qrLabel: string }>) {
  const t = useTranslations("Resultboard");
  const { fixed, groups } = useMemo(() => partnerGroups(info.partners), [info.partners]);
  const [page, setPage] = useState(0);
  const rotateMs = info.config.partners.rotateS * 1000;
  useEffect(() => {
    if (groups.length < 2) return;
    const id = window.setInterval(() => setPage((p) => (p + 1) % groups.length), rotateMs);
    return () => window.clearInterval(id);
  }, [groups.length, rotateMs]);
  const active = groups.length ? page % groups.length : 0;
  const logo = (p: ResultboardInfo["partners"][number]) => (
    <div key={p.id} className={s.logo} title={p.name}>
      {p.logoSrc ? (
        // loga partnerů: SVG i bitmapy přes <img> (bez optimalizace, jako patička webu)
        // eslint-disable-next-line @next/next/no-img-element
        <img src={p.logoSrc} alt={p.name} loading="lazy" />
      ) : (
        p.name
      )}
    </div>
  );
  return (
    <footer className={s.pbar} data-testid="resultboard-partners">
      <div className={s.plab}>{t("partners")}</div>
      {fixed ? <div className={s.pgen}>{logo(fixed)}</div> : null}
      <div className={s.prot}>
        {groups.map((g, i) => (
          <div key={g.map((p) => p.id).join()} className={cx(s.pgrp, i === active && s.act)}>
            {g.map(logo)}
          </div>
        ))}
      </div>
      {groups.length > 1 ? (
        <div className={s.pdots}>
          {groups.map((g, i) => (
            <i key={g.map((p) => p.id).join()} className={i === active ? s.act : undefined} />
          ))}
        </div>
      ) : null}
      {info.config.partners.qr && qrSvg ? (
        <div className={s.pqr}>
          {/* SVG vygenerované na serveru knihovnou qrcode z naší URL */}
          <div className={s.qr} dangerouslySetInnerHTML={{ __html: qrSvg }} />
          <div>
            {t("qrTitle")}
            <br />
            <b>{qrLabel}</b>
          </div>
        </div>
      ) : null}
    </footer>
  );
}

/**
 * Kiosk se sám obnoví po nasazení nové verze (jiný build v `/api/live/resultboard`) nebo
 * jednou za 6 h – ale jen se spojením; při výpadku zůstanou poslední data (Q145).
 */
function useAutoReload(serverBuild: string, pageBuild: string, stale: boolean) {
  const loadedRef = useRef<number | null>(null);
  useEffect(() => {
    loadedRef.current ??= Date.now();
    const check = () => {
      if (
        shouldReload({
          pageBuild,
          serverBuild,
          loadedMs: loadedRef.current ?? Date.now(),
          nowMs: Date.now(),
          stale,
        })
      ) {
        window.location.reload();
      }
    };
    check();
    const id = window.setInterval(check, 60_000);
    return () => window.clearInterval(id);
  }, [serverBuild, pageBuild, stale]);
}
