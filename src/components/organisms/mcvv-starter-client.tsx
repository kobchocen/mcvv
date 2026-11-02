"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import type { StarterSnapshot } from "@/lib/live/starter";
import {
  bestSample,
  buildStarterList,
  buildStarterView,
  clockQuality,
  corridorRange,
  cuesFor,
  formatCountdown,
  isLateStart,
  keypadLookup,
  mergePending,
  offsetSeconds,
  plannedStartMs,
  tapAction,
  type Corridor,
  type Cue,
  type ListFilter,
  type ListRow,
  type PendingAction,
  type StarterAction,
  type StarterMark,
  type StarterRunner,
} from "@/lib/live/starter-core";
import { DEFAULT_START_INTERVAL_S } from "@/lib/live/start-time";
import { loadValue, saveValue } from "@/lib/live/queue-store";

import styles from "./mcvv-starter-client.module.css";

type Snapshot = StarterSnapshot & { canSwitch?: boolean };
type ClockState = { offset: number; uncertainty: number; at: number };
type Sheet = { kind: "keypad" } | { kind: "late"; bib: number } | null;
type View = "queue" | "list";

const POLL_MS = 3000;
const FLUSH_MS = 1500;
const RESYNC_MS = 30_000;
const BURST = 8;
const TOAST_MS = 2200;
const MUTE_KEY = "mcvv-starter-muted";
const CORRIDOR_KEY = "mcvv-starter-corridor";

type Props = Readonly<{
  userId: number;
  initialCorridor: Corridor;
  canSwitch: boolean;
  locale: string;
}>;

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-4000-8000-${Math.random().toString(16).slice(2, 14)}`;
}

function hms(ms: number): string {
  return new Date(ms).toLocaleTimeString("cs-CZ", {
    timeZone: "Europe/Prague",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function mmss(ms: number): string {
  return formatCountdown(Math.max(0, Math.round(Math.abs(ms) / 1000)));
}

/**
 * Obrazovka startéra (/start): přesný čas sesynchronizovaný se serverem, fronta nejbližších
 * čtyř závodníků koridoru, ťuknutí „na startu“, pruh Nevyběhli, číselník, celá startovka a
 * potvrzení pozdního startu. Funguje i bez signálu (startovka a fronta zápisů v IndexedDB).
 */
export function McvvStarterClient({ userId, initialCorridor, canSwitch, locale }: Props) {
  const t = useTranslations("Starter");
  const [corridor, setCorridor] = useState<Corridor>(initialCorridor);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [pending, setPending] = useState<PendingAction[]>([]);
  const [acked, setAcked] = useState<(PendingAction & { ackAt: number })[]>([]);
  const [online, setOnline] = useState(true);
  const [clock, setClock] = useState<ClockState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [muted, setMuted] = useState(false);
  const [view, setView] = useState<View>("queue");
  const [filter, setFilter] = useState<ListFilter>("all");
  const [sheet, setSheet] = useState<Sheet>(null);
  const [keypad, setKeypad] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const perfAnchor = useRef<number | null>(null);
  const clockRef = useRef<ClockState | null>(null);
  const etagRef = useRef<string | null>(null);
  const pendingRef = useRef<PendingAction[]>([]);
  const flushing = useRef(false);
  const audioRef = useRef<AudioContext | null>(null);
  const scheduled = useRef(new Set<string>());
  const mutedRef = useRef(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const scrolledRef = useRef(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Serverový čas: monotónní performance.now() + kotva z poslední synchronizace. */
  const serverNow = useCallback((): number => {
    if (perfAnchor.current !== null) return performance.now() + perfAnchor.current;
    return Date.now() + (clockRef.current?.offset ?? 0);
  }, []);

  const show = useCallback((text: string) => {
    setToast(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  // --- načtení z IndexedDB (startovka, neodeslané zápisy, hodiny, ztlumení) ---
  useEffect(() => {
    let cancelled = false;
    const stored =
      canSwitch && typeof localStorage !== "undefined"
        ? Number(localStorage.getItem(CORRIDOR_KEY))
        : NaN;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from localStorage on mount
    if (stored === 1 || stored === 2) setCorridor(stored);
    const mutedStored =
      typeof localStorage !== "undefined" && localStorage.getItem(MUTE_KEY) === "1";
    mutedRef.current = mutedStored;
    setMuted(mutedStored);
    void Promise.all([
      loadValue<PendingAction[]>(`starter:pending:${userId}`),
      loadValue<ClockState>("starter:clock"),
    ]).then(([queue, savedClock]) => {
      if (cancelled) return;
      if (queue?.length) {
        pendingRef.current = queue;
        setPending(queue);
      }
      if (savedClock && !clockRef.current) {
        clockRef.current = savedClock;
        setClock(savedClock);
      }
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [userId, canSwitch]);

  useEffect(() => {
    let cancelled = false;
    etagRef.current = null;
    void loadValue<Snapshot>(`starter:snap:${corridor}`).then((cached) => {
      if (!cancelled && cached) setSnapshot((current) => current ?? cached);
    });
    return () => {
      cancelled = true;
    };
  }, [corridor]);

  const persistPending = useCallback(
    (next: PendingAction[]) => {
      pendingRef.current = next;
      setPending(next);
      void saveValue(`starter:pending:${userId}`, next);
    },
    [userId],
  );

  // --- service worker (stránka jde otevřít i bez signálu) a wake lock ---
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/start-sw.js", { scope: `/${locale}/start` })
      .then(() => navigator.serviceWorker.ready)
      .then((registration) => {
        const urls = [
          window.location.pathname,
          ...performance
            .getEntriesByType("resource")
            .map((entry) => entry.name)
            .filter((name) => name.includes("/_next/static/")),
        ];
        registration.active?.postMessage({ type: "precache", urls });
      })
      .catch(() => undefined);
  }, [locale]);

  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> };
    };
    const acquire = () => {
      if (document.visibilityState === "visible" && nav.wakeLock) {
        nav.wakeLock
          .request("screen")
          .then((l) => (lock = l))
          .catch(() => undefined);
      }
    };
    acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      document.removeEventListener("visibilitychange", acquire);
      void lock?.release().catch(() => undefined);
    };
  }, []);

  // --- synchronizace hodin: dávka vzorků, pak pravidelně ---
  useEffect(() => {
    let cancelled = false;
    const sample = async () => {
      const sentPerf = performance.now();
      const response = await fetch("/api/live/clock", { cache: "no-store" });
      const receivedPerf = performance.now();
      const receivedDate = Date.now();
      const body = (await response.json()) as { now: number };
      const rtt = receivedPerf - sentPerf;
      const server = body.now + rtt / 2;
      return { rtt, anchor: server - receivedPerf, offset: server - receivedDate };
    };
    const burst = async (count: number) => {
      const samples: Awaited<ReturnType<typeof sample>>[] = [];
      for (let i = 0; i < count && !cancelled; i += 1) {
        try {
          samples.push(await sample());
        } catch {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 200));
      }
      const best = bestSample(samples);
      if (!best || cancelled) return;
      perfAnchor.current = best.anchor;
      const next = { offset: best.offset, uncertainty: Math.round(best.rtt / 2), at: Date.now() };
      clockRef.current = next;
      setClock(next);
      void saveValue("starter:clock", next);
    };
    void burst(BURST);
    const timer = setInterval(() => void burst(3), RESYNC_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void burst(BURST);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  // --- tik obrazovky ---
  useEffect(() => {
    const timer = setInterval(() => setNow(serverNow()), 100);
    return () => clearInterval(timer);
  }, [serverNow]);

  // --- stahování startovky každé ~3 s ---
  const fetchSnapshot = useCallback(async () => {
    const startedAt = Date.now();
    try {
      const response = await fetch(`/api/live/starter?corridor=${corridor}`, {
        cache: "no-store",
        headers: etagRef.current ? { "If-None-Match": etagRef.current } : undefined,
      });
      if (response.status === 304) {
        setOnline(true);
        setAcked((list) => list.filter((entry) => entry.ackAt >= startedAt));
        return;
      }
      if (!response.ok) {
        setOnline(response.status < 500);
        return;
      }
      const data = (await response.json()) as Snapshot;
      etagRef.current = response.headers.get("etag");
      setOnline(true);
      setSnapshot(data);
      setAcked((list) => list.filter((entry) => entry.ackAt >= startedAt));
      void saveValue(`starter:snap:${data.corridor}`, data);
    } catch {
      setOnline(false);
    }
  }, [corridor]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- start polling the start list (async fetch)
    void fetchSnapshot();
    const timer = setInterval(() => void fetchSnapshot(), POLL_MS);
    const goOnline = () => void fetchSnapshot();
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, [fetchSnapshot]);

  // --- odesílání fronty zápisů (idempotentně podle id) ---
  const flush = useCallback(async () => {
    if (flushing.current || pendingRef.current.length === 0) return;
    flushing.current = true;
    const batch = pendingRef.current.slice(0, 50);
    try {
      const response = await fetch(`/api/live/starter?corridor=${corridor}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: batch }),
      });
      if (response.status === 401 || response.status === 403 || response.status >= 500) {
        setOnline(response.status < 500);
        return;
      }
      if (response.status === 422) {
        // poškozená položka: zahodit, ať neblokuje frontu
        persistPending(pendingRef.current.filter((entry) => !batch.includes(entry)));
        return;
      }
      if (!response.ok) return;
      const body = (await response.json()) as {
        results: { id: string; outcome: string; reason?: string }[];
      };
      setOnline(true);
      const done = new Set(body.results.map((result) => result.id));
      const ackAt = Date.now();
      setAcked((list) => [
        ...list,
        ...batch.filter((entry) => done.has(entry.id)).map((entry) => ({ ...entry, ackAt })),
      ]);
      persistPending(pendingRef.current.filter((entry) => !done.has(entry.id)));
      const rejected = body.results.find((result) => result.outcome === "rejected");
      if (rejected) show(t("rejected"));
      etagRef.current = null;
      void fetchSnapshot();
    } catch {
      setOnline(false);
    } finally {
      flushing.current = false;
    }
  }, [corridor, fetchSnapshot, persistPending, show, t]);

  useEffect(() => {
    const timer = setInterval(() => void flush(), FLUSH_MS);
    return () => clearInterval(timer);
  }, [flush]);

  // --- odvozený stav ---
  /** Interval ročníku (st_interval) – zóny fronty a práh pozdního startu. */
  const intervalS = snapshot?.intervalS ?? DEFAULT_START_INTERVAL_S;
  const runners = useMemo<StarterRunner[]>(() => {
    if (!snapshot) return [];
    return snapshot.runners.map((runner) => ({
      ...runner,
      plannedMs: plannedStartMs(
        snapshot.zero,
        runner.bib,
        snapshot.intervalS,
        snapshot.secondStartFrom,
      ),
    }));
  }, [snapshot]);
  const byBib = useMemo(() => new Map(runners.map((runner) => [runner.bib, runner])), [runners]);
  const marks = useMemo<Map<number, StarterMark>>(() => {
    const server = new Map<number, StarterMark>(
      (snapshot?.marks ?? []).map((mark) => [mark.bib, mark]),
    );
    return mergePending(
      server,
      [...acked, ...pending],
      (bib) => byBib.get(bib)?.plannedMs,
      intervalS,
    );
  }, [snapshot, acked, pending, byBib, intervalS]);
  const settings = snapshot?.settings;
  const redPhaseS = settings?.redPhaseS ?? 5;
  const view$ = useMemo(
    () =>
      buildStarterView(runners, marks, now, {
        redPhaseS,
        dnsWindowS: settings?.dnsWindowS ?? 300,
        intervalS,
      }),
    [runners, marks, now, redPhaseS, settings?.dnsWindowS, intervalS],
  );
  const quality = clockQuality({
    uncertaintyMs: clock?.uncertainty ?? null,
    lastSyncAt: clock?.at ?? null,
    // nástěnný čas zařízení ≈ serverový čas − offset (bez nečistého Date.now() v renderu)
    now: now - (clock?.offset ?? 0),
  });

  // --- zvuk: Web Audio (pípání) a syntéza řeči, plánováno přesně podle serverového času ---
  const ensureAudio = useCallback(() => {
    if (typeof window === "undefined") return null;
    if (!audioRef.current) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      audioRef.current = new Ctor();
    }
    if (audioRef.current.state === "suspended") void audioRef.current.resume();
    return audioRef.current;
  }, []);

  const playCue = useCallback(
    (cue: Cue, delayMs: number) => {
      if (cue.kind === "say") {
        if (typeof speechSynthesis === "undefined" || !cue.text) return;
        const text = cue.text;
        setTimeout(
          () => {
            if (mutedRef.current) return;
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = "cs-CZ";
            utterance.rate = 1.1;
            speechSynthesis.speak(utterance);
          },
          Math.max(0, delayMs),
        );
        return;
      }
      const ctx = ensureAudio();
      if (!ctx) return;
      const at = ctx.currentTime + Math.max(0, delayMs) / 1000;
      const duration = cue.kind === "long" ? 0.7 : 0.14;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.value = cue.kind === "long" ? 1320 : 880;
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.4, at + 0.01);
      gain.gain.setValueAtTime(0.4, at + duration - 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(at);
      osc.stop(at + duration + 0.02);
    },
    [ensureAudio],
  );

  useEffect(() => {
    if (muted || !settings || settings.sound === "off") return;
    const starts = new Set(view$.queue.map((row) => row.plannedMs));
    for (const start of starts) {
      for (const [index, cue] of cuesFor(settings.sound, start).entries()) {
        const delay = cue.at - now;
        const key = `${start}:${index}:${settings.sound}`;
        if (delay > 1000 || delay < -150 || scheduled.current.has(key)) continue;
        scheduled.current.add(key);
        playCue(cue, delay);
      }
    }
    if (scheduled.current.size > 500) scheduled.current.clear();
  }, [now, muted, settings, view$.queue, playCue]);

  // odemknutí zvuku prvním dotykem (mobilní prohlížeče bez gesta nepípnou)
  useEffect(() => {
    const unlock = () => ensureAudio();
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => window.removeEventListener("pointerdown", unlock);
  }, [ensureAudio]);

  const toggleMute = () => {
    const next = !muted;
    mutedRef.current = next;
    setMuted(next);
    localStorage.setItem(MUTE_KEY, next ? "1" : "0");
    if (next && typeof speechSynthesis !== "undefined") speechSynthesis.cancel();
  };

  const testSound = () => {
    ensureAudio();
    const mode = settings?.sound && settings.sound !== "off" ? settings.sound : "beep";
    // stejná sekvence jako před startem, start za 5,2 s od teď
    for (const cue of cuesFor(mode, 5200)) playCue(cue, cue.at);
    show(t("soundTest"));
  };

  // --- akce ---
  const enqueue = useCallback(
    (bib: number, action: StarterAction) => {
      const entry: PendingAction = { id: uuid(), bib, action, at: Math.round(serverNow()) };
      persistPending([...pendingRef.current, entry]);
      void flush();
      const messages: Record<StarterAction, string> = {
        mark: t("toastMarked", { bib }),
        unmark: t("toastUnmarked", { bib }),
        ontime: t("toastOntime", { bib }),
        late: t("toastLate", { bib }),
      };
      show(messages[action]);
    },
    [flush, persistPending, serverNow, show, t],
  );

  const tap = (runner: StarterRunner) => {
    const action = tapAction(runner.plannedMs, serverNow(), marks.has(runner.bib), redPhaseS);
    if (action === "late") {
      setSheet({ kind: "late", bib: runner.bib });
      return;
    }
    if (action) enqueue(runner.bib, action);
  };

  const switchCorridor = () => {
    if (!canSwitch) return;
    const next: Corridor = corridor === 1 ? 2 : 1;
    localStorage.setItem(CORRIDOR_KEY, String(next));
    setSnapshot(null);
    setAcked([]);
    setCorridor(next);
  };

  // celá startovka: posun na čáru „TEĎ“ při otevření
  useEffect(() => {
    if (view !== "list") {
      scrolledRef.current = false;
      return;
    }
    if (scrolledRef.current || !listRef.current) return;
    const line = listRef.current.querySelector<HTMLElement>("[data-nowline]");
    if (line) listRef.current.scrollTop = line.offsetTop - listRef.current.offsetTop - 63 * 4;
    scrolledRef.current = true;
  });

  // --- vykreslení ---
  const range = snapshot ? corridorRange(corridor, snapshot.secondStartFrom) : null;
  const pendingCount = pending.length;

  const header = (
    <header className={styles.header}>
      <div className={styles.hrow}>
        <button
          type="button"
          className={styles.corr}
          onClick={switchCorridor}
          disabled={!canSwitch}
          data-testid="starter-corridor"
          aria-label={canSwitch ? t("switchCorridor") : undefined}
        >
          {t("corridor", { corridor })}{" "}
          {range ? (
            <small>
              ·{" "}
              {range.last === null
                ? t("rangeFrom", { first: range.first })
                : t("range", { first: range.first, last: range.last })}
              {canSwitch ? " ⇄" : ""}
            </small>
          ) : null}
        </button>
        <div
          className={`${styles.conn} ${online ? "" : styles.connOff}`}
          data-testid="starter-conn"
        >
          <span
            className={`${styles.dot} ${online ? (pendingCount ? styles.dotO : styles.dotG) : styles.dotR}`}
          />
          {online
            ? pendingCount
              ? t("onlineSending", { count: pendingCount })
              : t("online")
            : t("offline")}
        </div>
        <button
          type="button"
          className={styles.iconBtn}
          onClick={testSound}
          aria-label={t("test")}
          title={t("test")}
        >
          ♪
        </button>
        <button
          type="button"
          className={styles.iconBtn}
          onClick={toggleMute}
          aria-label={muted ? t("unmute") : t("mute")}
          title={muted ? t("unmute") : t("mute")}
          data-testid="starter-mute"
        >
          {muted ? (
            <svg viewBox="0 0 24 24" fill="#ff6b6b" aria-hidden>
              <path d="M3 9v6h4l5 5V4L7 9H3z" />
              <path d="M16 9l5 6M21 9l-5 6" stroke="#ff6b6b" strokeWidth="2.2" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="#fff" aria-hidden>
              <path d="M3 9v6h4l5 5V4L7 9H3z" />
              <path d="M16.5 12a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z" />
            </svg>
          )}
        </button>
      </div>
      <div className={styles.clockrow}>
        <div className={`${styles.clock} ${styles.num}`} data-testid="starter-clock">
          {hms(now)}
        </div>
        <div
          className={`${styles.acc} ${quality === "warn" ? styles.accWarn : quality === "none" ? styles.accNone : ""}`}
          data-testid="starter-accuracy"
          data-quality={quality}
        >
          <span
            className={`${styles.dot} ${quality === "good" ? styles.dotG : quality === "warn" ? styles.dotO : styles.dotR}`}
          />
          {quality === "none"
            ? t("clockNone")
            : quality === "warn" && clock && now - clock.offset - clock.at > 5 * 60_000
              ? t("clockStale", { minutes: Math.floor((now - clock.offset - clock.at) / 60_000) })
              : t("clockAccuracy", { ms: clock?.uncertainty ?? 0 })}
        </div>
      </div>
    </header>
  );

  const offbar =
    !online && hydrated ? (
      <div className={styles.offbar} data-testid="starter-offbar">
        ⚠ {t("offbar", { count: pendingCount })}
      </div>
    ) : null;

  const queueView = (
    <div className={styles.view}>
      <div className={styles.counters}>
        <div className={styles.cnt}>
          <span className={styles.cntL}>{t("toStart")}</span>
          <span className={`${styles.cntV} ${styles.num}`} data-testid="starter-count-up">
            {view$.counts.toStart}
          </span>
        </div>
        <button
          type="button"
          className={`${styles.cnt} ${styles.cntDns}`}
          onClick={() => {
            setFilter("missing");
            setView("list");
          }}
        >
          <span className={styles.cntL}>{t("missing")}</span>
          <span className={`${styles.cntV} ${styles.num}`} data-testid="starter-count-dns">
            {view$.counts.missing}
          </span>
        </button>
      </div>
      <div className={styles.queue} data-testid="starter-queue">
        {view$.queue.map((row) => {
          const zoneClass =
            row.zone === "red"
              ? styles.red
              : row.zone === "now"
                ? styles.zNow
                : row.zone === "next"
                  ? styles.zNext
                  : styles.zLater;
          const remaining = row.plannedMs - now;
          return (
            <button
              type="button"
              key={row.bib}
              className={`${styles.row} ${zoneClass} ${row.marked ? styles.marked : ""}`}
              onClick={() => tap(row)}
              data-testid={`starter-row-${row.bib}`}
              data-zone={row.zone}
              data-marked={row.marked ? "1" : "0"}
            >
              <div className={`${styles.bib} ${styles.num}`}>{row.bib}</div>
              <div className={styles.mid}>
                <div className={styles.name}>{row.name}</div>
                <div className={`${styles.st} ${styles.num}`}>
                  {row.zone === "red" ? (
                    t("notMarked")
                  ) : row.marked ? (
                    <span className={styles.markedTag}>{t("atStart")}</span>
                  ) : (
                    hms(row.plannedMs)
                  )}
                </div>
              </div>
              <div className={`${styles.cd} ${styles.num}`}>
                {remaining > 0 ? `−${mmss(remaining)}` : `+${mmss(remaining)}`}
              </div>
              {row.zone === "red" ? (
                <div
                  className={styles.bar}
                  style={{
                    width: `${Math.max(0, Math.min(1, (row.plannedMs + redPhaseS * 1000 - now) / (redPhaseS * 1000 || 1))) * 100}%`,
                  }}
                />
              ) : null}
            </button>
          );
        })}
        {Array.from({ length: Math.max(0, 4 - view$.queue.length) }, (_, index) => (
          <div key={`empty-${index}`} className={styles.empty}>
            {view$.queue.length === 0 && index === 0 && snapshot ? t("queueEmpty") : "—"}
          </div>
        ))}
      </div>
      <div className={styles.strip} data-testid="starter-strip">
        <div className={styles.stripH}>
          <b>{t("stripTitle", { minutes: Math.round((settings?.dnsWindowS ?? 300) / 60) })}</b>
          <button
            type="button"
            className={styles.all}
            onClick={() => {
              setFilter("missing");
              setView("list");
            }}
          >
            {t("all", { count: view$.counts.missing })} ›
          </button>
        </div>
        <div className={styles.chips}>
          {view$.missing.length ? (
            view$.missing.map((runner) => (
              <div
                key={runner.bib}
                className={styles.chip}
                data-testid={`starter-dns-${runner.bib}`}
              >
                <div className={styles.chipT}>
                  <span className={`${styles.chipB} ${styles.num}`}>{runner.bib}</span>
                  <span className={`${styles.chipP} ${styles.num}`}>{hms(runner.plannedMs)}</span>
                </div>
                <div className={styles.chipN}>{runner.name}</div>
                <button
                  type="button"
                  className={styles.redBtn}
                  onClick={() => setSheet({ kind: "late", bib: runner.bib })}
                >
                  {t("startNow")}
                </button>
              </div>
            ))
          ) : (
            <div className={styles.stripEmpty}>{t("stripEmpty")}</div>
          )}
        </div>
      </div>
      <div className={styles.bottom}>
        <button
          type="button"
          onClick={() => {
            setKeypad("");
            setSheet({ kind: "keypad" });
          }}
          data-testid="starter-keypad-open"
        >
          ⌨&nbsp;{t("otherBib")}
        </button>
        <button
          type="button"
          className={styles.sec}
          onClick={() => {
            setFilter("all");
            setView("list");
          }}
          data-testid="starter-list-open"
        >
          ☰&nbsp;{t("fullList")}
        </button>
      </div>
    </div>
  );

  const listRows = buildStarterList(runners, marks, now, redPhaseS, filter);
  const statusOf = (row: ListRow): { className: string; label: string } => {
    if (row.state === "started") {
      return row.late
        ? { className: `${styles.liDone} ${styles.liLate}`, label: t("stLate") }
        : { className: styles.liDone, label: t("stStarted") };
    }
    if (row.state === "missing") return { className: styles.liDns, label: t("stMissing") };
    if (row.state === "red") return { className: styles.liDns, label: t("stNotMarked") };
    const remaining = row.plannedMs - now;
    const intervalMs = intervalS * 1000;
    const zone =
      remaining <= intervalMs ? styles.liNow : remaining <= 2 * intervalMs ? styles.liNext : "";
    if (row.state === "marked") return { className: `${styles.liMk} ${zone}`, label: t("atStart") };
    return { className: `${styles.liUp} ${zone}`, label: t("stIn", { time: mmss(remaining) }) };
  };
  const nowlineIndex = filter === "all" ? listRows.findIndex((row) => row.plannedMs > now) : -1;
  const listView = (
    <div className={styles.view}>
      <div className={styles.listH}>
        <button type="button" className={styles.back} onClick={() => setView("queue")}>
          ‹ {t("back")}
        </button>
        <div className={styles.ttl}>{t("listTitle", { corridor })}</div>
      </div>
      <div className={styles.filters}>
        {(["all", "pending", "missing"] as const).map((value) => (
          <button
            type="button"
            key={value}
            className={`${styles.filter} ${filter === value ? styles.filterOn : ""}`}
            onClick={() => {
              scrolledRef.current = false;
              setFilter(value);
            }}
          >
            {t(`filter_${value}`)}
          </button>
        ))}
      </div>
      <div className={styles.list} ref={listRef} data-testid="starter-list">
        {listRows.map((row, index) => {
          const status = statusOf(row);
          const line =
            index === nowlineIndex ? (
              <div key="nowline" className={styles.nowline} data-nowline>
                {t("nowline", { time: hms(now) })}
              </div>
            ) : null;
          return [
            line,
            <button
              type="button"
              key={row.bib}
              className={`${styles.li} ${status.className}`}
              onClick={() => {
                if (row.state === "missing") setSheet({ kind: "late", bib: row.bib });
                else if (row.state !== "started") tap(row);
              }}
            >
              <span className={`${styles.liTm} ${styles.num}`}>{hms(row.plannedMs)}</span>
              <span className={`${styles.liB} ${styles.num}`}>{row.bib}</span>
              <span className={styles.liN}>{row.name}</span>
              <span className={styles.liS}>{status.label}</span>
            </button>,
          ];
        })}
      </div>
    </div>
  );

  const keypadSheet = (() => {
    if (sheet?.kind !== "keypad" || !snapshot) return null;
    const bib = Number(keypad);
    let result: ReactNode;
    if (!keypad) {
      result = (
        <div className={styles.kpRes}>
          <div className={styles.kpL2} style={{ margin: 0 }}>
            {t("kpHint")}
          </div>
        </div>
      );
    } else {
      const lookup = keypadLookup({
        bib,
        corridor,
        secondStartFrom: snapshot.secondStartFrom,
        runners: byBib,
        marks,
        nowMs: now,
        redPhaseS,
      });
      if (lookup.kind === "other-corridor") {
        result = (
          <div className={styles.kpRes} style={{ background: "#ffe8c2" }} data-kp="other">
            <div className={styles.kpL1}>
              <b>{bib}</b>
              <span>{t("corridor", { corridor: lookup.corridor })}</span>
            </div>
            <div className={styles.kpL2} style={{ color: "#8a4b00", marginBottom: 0 }}>
              {t("kpOther", { corridor: lookup.corridor })}
            </div>
          </div>
        );
      } else if (lookup.kind === "unknown") {
        result = (
          <div className={styles.kpRes} data-kp="unknown">
            <div className={styles.kpL1}>
              <b>{bib}</b>
              <span>{t("kpUnknownTitle")}</span>
            </div>
            <div className={styles.kpL2}>{t("kpUnknown")}</div>
            <button
              type="button"
              className={styles.kpBtn}
              onClick={() => {
                enqueue(bib, "late");
                setSheet(null);
              }}
            >
              {t("kpUnknownSave")}
            </button>
          </div>
        );
      } else if (lookup.kind === "missing") {
        result = (
          <div className={styles.kpRes} style={{ background: "#fde0e0" }} data-kp="missing">
            <div className={styles.kpL1}>
              <b className={styles.num}>{bib}</b>
              <span>{lookup.runner.name}</span>
            </div>
            <div className={`${styles.kpL2} ${styles.num}`} style={{ color: "#6b1a1a" }}>
              {t("kpMissing", {
                time: hms(lookup.runner.plannedMs),
                offset: mmss(now - lookup.runner.plannedMs),
              })}
            </div>
            <button
              type="button"
              className={styles.kpBtn}
              onClick={() => setSheet({ kind: "late", bib })}
            >
              {t("startNow")}
            </button>
          </div>
        );
      } else if (lookup.kind === "started") {
        result = (
          <div className={styles.kpRes} data-kp="started">
            <div className={styles.kpL1}>
              <b className={styles.num}>{bib}</b>
              <span>{lookup.runner.name}</span>
            </div>
            <div className={styles.kpL2} style={{ marginBottom: 0 }}>
              {t("kpStarted")}
            </div>
          </div>
        );
      } else {
        const runner = lookup.runner;
        const before = now < runner.plannedMs;
        result = (
          <div
            className={styles.kpRes}
            style={{ background: lookup.marked ? "#dfe5ff" : "#d6f5df" }}
            data-kp="pending"
          >
            <div className={styles.kpL1}>
              <b className={styles.num}>{bib}</b>
              <span>{runner.name}</span>
            </div>
            <div className={`${styles.kpL2} ${styles.num}`}>
              {before
                ? t("kpPending", {
                    time: hms(runner.plannedMs),
                    left: mmss(runner.plannedMs - now),
                  })
                : t("kpRed", { time: hms(runner.plannedMs) })}
            </div>
            <button
              type="button"
              className={`${styles.kpBtn} ${styles.kpBtnMark}`}
              onClick={() => {
                tap(runner);
                setSheet(null);
              }}
            >
              {lookup.marked ? t("kpUnmark") : before ? t("atStart") : t("kpOntime")}
            </button>
          </div>
        );
      }
    }
    const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⌫"];
    return (
      <div className={styles.sheet} data-testid="starter-keypad">
        <div className={styles.grab} />
        <div className={styles.sheetH}>
          {t("otherBib")}
          <button
            type="button"
            className={styles.x}
            onClick={() => setSheet(null)}
            aria-label={t("close")}
          >
            ✕
          </button>
        </div>
        <div className={`${styles.kpDisp} ${styles.num}`}>
          <span>{keypad}</span>
          <span className={styles.caret} />
        </div>
        {result}
        <div className={styles.keys}>
          {keys.map((key) => (
            <button
              type="button"
              key={key}
              className={`${styles.key} ${/\d/.test(key) ? "" : styles.keyFn}`}
              onClick={() =>
                setKeypad((value) =>
                  key === "C"
                    ? ""
                    : key === "⌫"
                      ? value.slice(0, -1)
                      : value.length >= 3 || (value === "" && key === "0")
                        ? value
                        : value + key,
                )
              }
            >
              {key === "C" ? t("clear") : key}
            </button>
          ))}
        </div>
      </div>
    );
  })();

  const lateSheet = (() => {
    if (sheet?.kind !== "late") return null;
    const runner = byBib.get(sheet.bib);
    const planned = runner?.plannedMs ?? now;
    const offset = offsetSeconds(now, planned);
    const late = runner ? isLateStart(now, planned, intervalS) : false;
    return (
      <div className={styles.sheet} data-testid="starter-late">
        <div className={styles.grab} />
        <div className={styles.sheetH}>
          {t("lateTitle")}
          <button
            type="button"
            className={styles.x}
            onClick={() => setSheet(null)}
            aria-label={t("close")}
          >
            ✕
          </button>
        </div>
        <div className={styles.ltBig}>
          <b className={styles.num}>{sheet.bib}</b>
          <span>{runner?.name ?? t("kpUnknownTitle")}</span>
        </div>
        <table className={`${styles.ltTab} ${styles.num}`}>
          <tbody>
            <tr>
              <td>{t("latePlanned")}</td>
              <td>{runner ? hms(planned) : "—"}</td>
            </tr>
            <tr>
              <td>{t("lateReal")}</td>
              <td>{hms(now)}</td>
            </tr>
            <tr>
              <td>{t("lateOffset")}</td>
              <td style={{ color: late ? "#b05a00" : undefined }}>
                {runner ? `+${formatCountdown(Math.max(0, offset))}` : "—"}
                {late ? <span className={styles.badge}>{t("lateBadge")}</span> : null}
                {runner && !late ? ` (${t("onTime")})` : null}
              </td>
            </tr>
          </tbody>
        </table>
        <div className={styles.ltNote}>{t("lateNote", { seconds: intervalS })}</div>
        <button
          type="button"
          className={styles.ltBtn}
          onClick={() => {
            enqueue(sheet.bib, "late");
            setSheet(null);
          }}
          data-testid="starter-late-confirm"
        >
          {t("startNowCaps")}
        </button>
        <button type="button" className={styles.ltCancel} onClick={() => setSheet(null)}>
          {t("cancel")}
        </button>
      </div>
    );
  })();

  return (
    <div className={styles.root} data-testid="starter-screen">
      {header}
      {offbar}
      {!snapshot ? (
        <div className={styles.loading}>{online ? t("loading") : t("noCache")}</div>
      ) : view === "queue" ? (
        queueView
      ) : (
        listView
      )}
      {sheet ? (
        <>
          <div className={styles.scrim} onClick={() => setSheet(null)} aria-hidden />
          {keypadSheet}
          {lateSheet}
        </>
      ) : null}
      {toast ? (
        <div className={styles.toast} role="status">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
