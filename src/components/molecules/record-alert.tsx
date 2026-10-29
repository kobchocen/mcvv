"use client";

import { useTranslations } from "next-intl";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import type { TrBatch } from "@/hooks/use-record-alerts";
import { drawConfetti, makeConfetti } from "@/lib/live/confetti-core";
import { TR_SUMMARY_OVER, type TrCard, type TrMark } from "@/lib/live/records-live-core";
import { formatMinutes } from "@/lib/live/speaker-core";

import s from "./record-alert.module.css";

export const recordStyles = s;

export type RecordMode = "speaker" | "board" | "online";

/** Délka překryvu (Q163): speaker 7 s, resultboard 10 s, online 6 s; souhrn +3 s. */
export const RECORD_DURATION_MS: Record<RecordMode, number> = {
  speaker: 7000,
  board: 10_000,
  online: 6000,
};
const SUMMARY_EXTRA_MS = 3000;
const CONFETTI: Record<RecordMode, number> = { speaker: 320, board: 420, online: 200 };
const MOBILE_QUERY = "(max-width: 700px)";
const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

type Item = { id: number; cards: TrCard[]; idx: number; total: number };
type OverlayState = {
  seq: number;
  queue: Item[];
  toast: { cards: TrCard[]; seq: number } | null;
  nextId: number;
};

const subscribeNothing = () => () => {};
const isMobile = () => window.matchMedia?.(MOBILE_QUERY).matches === true;
/** `?trdemo=1&trt=ms` – zastavená animace pro snímky obrazovky. */
const readFreeze = () => {
  const q = new URLSearchParams(window.location.search);
  const v = q.get("trdemo") === "1" ? q.get("trt") : null;
  return v && /^\d+$/.test(v) ? Number(v) : null;
};

function enqueue(st: OverlayState, batch: TrBatch, toast: boolean): OverlayState {
  if (toast) return { ...st, seq: batch.seq, toast: { cards: batch.cards, seq: batch.seq } };
  let id = st.nextId;
  const items: Item[] =
    batch.cards.length > TR_SUMMARY_OVER
      ? [{ id: id++, cards: batch.cards, idx: 0, total: 1 }]
      : batch.cards.map((c, idx) => ({ id: id++, cards: [c], idx, total: batch.cards.length }));
  return { ...st, seq: batch.seq, queue: [...st.queue, ...items], nextId: id };
}

type Lookup = {
  runner: (bib: number) => { name: string; cat: string } | undefined;
  catName: (id: string) => string;
};

const matches = (query: string) =>
  typeof window !== "undefined" && window.matchMedia?.(query).matches === true;

/** Odznak v tabulce: „TR“ (zlatý), „= TR“ (vyrovnaný). */
export function RecordBadge({ kind }: Readonly<{ kind: "tr" | "eq" | undefined }>) {
  const t = useTranslations("Record");
  if (!kind) return null;
  return (
    <span
      className={`${s.badge} ${kind === "eq" ? s.badgeEq : ""}`}
      title={kind === "eq" ? t("badgeEqTitle") : t("badgeTitle")}
    >
      {kind === "eq" ? t("badgeEq") : t("badge")}
    </span>
  );
}

/**
 * Překryv „NOVÝ TRAŤOVÝ REKORD“ přes celou obrazovku (speaker, resultboard, online desktop)
 * nebo jen pruh nahoře (online na mobilu). Fronta: 2–3 rekordy naráz po sobě („1 / 2“), víc
 * než 3 jedna souhrnná karta (Q164). Konfety = vlastní canvas; při `prefers-reduced-motion`
 * bez konfet a pulzu, karta zůstane. Klik / Esc zavře (ne na resultboardu).
 */
export function RecordOverlay({
  batch,
  mode,
  runner,
  catName,
}: Readonly<{ batch: TrBatch | null; mode: RecordMode } & Lookup>) {
  const t = useTranslations("Record");
  const mobile = useSyncExternalStore(subscribeNothing, isMobile, () => false);
  const freeze = useSyncExternalStore(subscribeNothing, readFreeze, () => null);
  const [st, setSt] = useState<OverlayState>(() => ({
    seq: batch?.seq ?? 0,
    queue: [],
    toast: null,
    nextId: 1,
  }));
  // nová dávka → do fronty (online na mobilu: pruh); odvozeno během renderu, bez efektu
  let current = st;
  if (batch && batch.seq !== st.seq) {
    current = enqueue(st, batch, mode === "online" && mobile);
    setSt(current);
  }
  const { queue, toast } = current;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const toastCanvasRef = useRef<HTMLCanvasElement>(null);
  const cur = queue[0] ?? null;

  const next = useCallback(() => setSt((v) => ({ ...v, queue: v.queue.slice(1) })), []);
  const closeToast = useCallback(() => setSt((v) => ({ ...v, toast: null })), []);

  // délka karty + konfety
  useEffect(() => {
    if (!cur) return;
    const summary = cur.cards.length > TR_SUMMARY_OVER;
    const dur = RECORD_DURATION_MS[mode] + (summary ? SUMMARY_EXTRA_MS : 0);
    const eq = !summary && cur.cards[0].main.eq;
    const canvas = canvasRef.current;
    const reduced = matches(REDUCED_QUERY);
    let raf = 0;
    if (canvas && !reduced) {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      const ctx = canvas.getContext("2d");
      const n = Math.round(CONFETTI[mode] * (eq ? 0.3 : 1));
      const pieces = makeConfetti(canvas.width, canvas.height, n, 4242 + cur.id * 7, {
        cannons: !eq,
      });
      const start = performance.now();
      const frame = () => {
        const el = freeze ?? performance.now() - start;
        const fade = el > dur - 600 ? Math.max(0, (dur - el) / 600) : 1;
        if (ctx) drawConfetti(ctx, pieces, el / 1000, fade);
        if (freeze == null && el < dur) raf = requestAnimationFrame(frame);
      };
      frame();
    }
    const timer = freeze == null ? window.setTimeout(next, dur) : 0;
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [cur, mode, next, freeze]);

  // Esc zavře (speaker, online)
  useEffect(() => {
    if (!cur || mode === "board") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") next();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cur, mode, next]);

  // mobil: pruh 6 s, konfety jen v něm (2,8 s)
  useEffect(() => {
    if (!toast) return;
    const canvas = toastCanvasRef.current;
    let raf = 0;
    if (canvas && !matches(REDUCED_QUERY)) {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
      const ctx = canvas.getContext("2d");
      const pieces = makeConfetti(canvas.width, canvas.height, 46, 99 + toast.seq, {
        cannons: false,
        small: true,
      });
      const start = performance.now();
      const frame = () => {
        const el = freeze ?? performance.now() - start;
        if (ctx)
          drawConfetti(ctx, pieces, el / 1000, el > 2200 ? Math.max(0, (2800 - el) / 600) : 1);
        if (freeze == null && el < 2800) raf = requestAnimationFrame(frame);
      };
      frame();
    }
    const timer = freeze == null ? window.setTimeout(closeToast, RECORD_DURATION_MS.online) : 0;
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [toast, freeze, closeToast]);

  const recLabel = (m: TrMark) => catName(m.rec);
  const prevLine = (m: TrMark): ReactNode => {
    const values = {
      time: formatMinutes(m.prev.time),
      who: m.prev.who ?? "",
      year: m.prev.year ?? "",
    };
    return t.rich(m.prev.who ? "prev" : "prevUnknown", { ...values, b: (c) => <b>{c}</b> });
  };
  const diffChip = (m: TrMark) => (
    <span className={s.diff}>
      {m.eq ? t("same") : t("faster", { diff: formatMinutes(m.prev.time - m.time) })}
    </span>
  );
  const title = (m: TrMark) =>
    m.eq ? (m.abs ? t("eqAbs") : t("eqRecord")) : m.abs ? t("newAbs") : t("newRecord");
  const extraLine = (m: TrMark) =>
    t(m.eq ? "alsoEq" : "also", { cat: recLabel(m), time: formatMinutes(m.prev.time) });

  const renderCard = (item: Item) => {
    if (item.cards.length > TR_SUMMARY_OVER) {
      return (
        <>
          <div className={s.k}>
            <small>★ ★ ★</small>
            {t("summary", { count: item.cards.length })}
          </div>
          <table className={s.list}>
            <tbody>
              {item.cards.map((c) => (
                <tr key={c.bib}>
                  <td className={s.lc}>
                    {c.main.eq ? "= " : ""}
                    {recLabel(c.main)}
                  </td>
                  <td>
                    <b>{c.bib}</b> {runner(c.bib)?.name}
                  </td>
                  <td className={s.lt}>{formatMinutes(c.time)}</td>
                  <td className={s.ld}>
                    {c.main.eq ? "=" : `−${formatMinutes(c.main.prev.time - c.time)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className={s.note}>{t("notePlural")}</div>
        </>
      );
    }
    const c = item.cards[0];
    const r = runner(c.bib);
    return (
      <>
        {item.total > 1 ? (
          <div className={s.q}>
            {item.idx + 1} / {item.total}
          </div>
        ) : null}
        <div className={c.main.abs ? `${s.k} ${s.long}` : s.k}>
          <small>{c.main.eq ? "=" : "★ ★ ★"}</small>
          {title(c.main)}
        </div>
        <div className={s.cat}>
          {recLabel(c.main)}
          {c.main.abs && r && r.cat !== c.main.rec ? ` · ${catName(r.cat)}` : ""}
        </div>
        <div className={s.run}>
          <span className={s.bib}>{c.bib}</span>
          <span>{r?.name}</span>
        </div>
        <div className={s.time}>{formatMinutes(c.time)}</div>
        <div className={s.prev}>
          {prevLine(c.main)} {diffChip(c.main)}
        </div>
        {c.extra.map((m) => (
          <div key={m.rec} className={s.extra}>
            {extraLine(m)}
          </div>
        ))}
        <div className={s.note}>{t("note")}</div>
      </>
    );
  };

  const summary = cur ? cur.cards.length > TR_SUMMARY_OVER : false;
  const dur = cur ? RECORD_DURATION_MS[mode] + (summary ? SUMMARY_EXTRA_MS : 0) : 0;
  const eq = cur && !summary ? cur.cards[0].main.eq : false;
  const frozen =
    freeze != null
      ? ({ animationDelay: `-${freeze}ms`, animationPlayState: "paused" } as const)
      : undefined;

  return (
    <>
      {cur ? (
        <div
          key={cur.id}
          className={`${s.overlay} ${s[mode]} ${eq ? s.eq : ""}`}
          role="alert"
          onClick={mode === "board" ? undefined : next}
          style={{ ["--tr-dur" as string]: `${dur}ms` }}
        >
          <div className={s.bg} style={frozen} />
          <div className={s.frame} style={frozen} />
          <canvas ref={canvasRef} className={s.canvas} aria-hidden />
          <div className={s.card} style={frozen}>
            {renderCard(cur)}
            <div className={s.bar}>
              <i style={frozen} />
            </div>
            {mode !== "board" ? <div className={s.close}>{t("close")}</div> : null}
          </div>
        </div>
      ) : null}
      {toast ? (
        <RecordToast
          key={toast.seq}
          cards={toast.cards}
          canvasRef={toastCanvasRef}
          onClose={closeToast}
          {...{ runner, catName }}
        />
      ) : null}
    </>
  );
}

function RecordToast({
  cards,
  canvasRef,
  onClose,
  runner,
  catName,
}: Readonly<
  {
    cards: TrCard[];
    canvasRef: React.RefObject<HTMLCanvasElement | null>;
    onClose: () => void;
  } & Lookup
>) {
  const t = useTranslations("Record");
  const c = cards[0];
  const m = c.main;
  return (
    <div className={s.toast} role="status" aria-live="polite">
      <canvas ref={canvasRef} className={s.canvas} aria-hidden />
      <div className={s.tti} aria-hidden>
        🏆
      </div>
      <div className={s.tbody}>
        <b className={s.th}>
          {m.eq ? (m.abs ? t("eqAbs") : t("eqRecord")) : m.abs ? t("newAbs") : t("newRecord")}
        </b>
        <span>
          {catName(m.rec)} · <b>{c.bib}</b> {runner(c.bib)?.name}{" "}
          <span className={s.tm}>{formatMinutes(c.time)}</span>
        </span>
        <small>
          {m.eq
            ? t("toastEq", { time: formatMinutes(m.prev.time) })
            : t("toastFaster", {
                diff: formatMinutes(m.prev.time - m.time),
                time: formatMinutes(m.prev.time),
              })}
          {m.prev.who ? ` (${m.prev.who}, ${m.prev.year})` : ""} · {t("prelim")}
        </small>
        {cards.length > 1 ? <small>{t("more", { count: cards.length - 1 })}</small> : null}
      </div>
      <button type="button" aria-label={t("closeAria")} onClick={onClose}>
        ×
      </button>
    </div>
  );
}
