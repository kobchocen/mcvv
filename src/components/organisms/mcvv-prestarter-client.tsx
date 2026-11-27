"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { StarterSnapshot } from "@/lib/live/starter";
import {
  bestSample,
  buildStarterList,
  buildStarterView,
  clockQuality,
  corridorRange,
  formatCountdown,
  isLateStart,
  mergePending,
  offsetSeconds,
  plannedStartMs,
  PRESTARTER_QUEUE_SIZE,
  PRESTARTER_SOURCE,
  acceptsSnapshot,
  snapshotForCorridor,
  tapAction,
  type Corridor,
  type ListFilter,
  type ListRow,
  type PendingAction,
  type StarterAction,
  type StarterMark,
  type StarterRunner,
} from "@/lib/live/starter-core";
import { DEFAULT_START_INTERVAL_S } from "@/lib/live/start-time";
import { prestartCountdown } from "@/lib/live/prestarter-core";
import { loadValue, saveValue } from "@/lib/live/queue-store";

import styles from "./mcvv-prestarter-client.module.css";

type Snapshot = StarterSnapshot & { canSwitch?: boolean };
type ClockState = { offset: number; uncertainty: number; at: number };
type View = "queue" | "list";

const API = "/api/live/prestarter";
const POLL_MS = 3000;
const FLUSH_MS = 1500;
const RESYNC_MS = 30_000;
const BURST = 8;
const TOAST_MS = 2200;
const CORRIDOR_KEY = "mcvv-prestarter-corridor";

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

/** Bez diakritiky a velikosti písmen – hledání „sefcik“ najde „Šefčík“. */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Obrazovka předstartéra (/predstarter, #379): telefon na výšku, 6 stejně velkých dlaždic
 * nejbližších závodníků vlastního koridoru, ťuknutím „na startu“ (stejný záznam startu jako
 * startér – platí pozdější ťuknutí), box Neodstartovali s pozdním startem a celá startovka
 * s hledáním. Hodiny, offline fronta ťuknutí a startovka v IndexedDB jako u startéra.
 */
export function McvvPrestarterClient({ userId, initialCorridor, canSwitch, locale }: Props) {
  const t = useTranslations("Prestarter");
  const [corridor, setCorridor] = useState<Corridor>(initialCorridor);
  const [rawSnapshot, setSnapshot] = useState<Snapshot | null>(null);
  // Jen startovka koridoru ze štítku – zastaralá odpověď jiného koridoru se nezobrazí.
  const snapshot = snapshotForCorridor(rawSnapshot, corridor);
  const [pending, setPending] = useState<PendingAction[]>([]);
  const [acked, setAcked] = useState<(PendingAction & { ackAt: number })[]>([]);
  const [online, setOnline] = useState(true);
  const [clock, setClock] = useState<ClockState | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [view, setView] = useState<View>("queue");
  const [filter, setFilter] = useState<ListFilter>("all");
  const [query, setQuery] = useState("");
  const [missingOpen, setMissingOpen] = useState(false);
  const [lateBib, setLateBib] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const perfAnchor = useRef<number | null>(null);
  const clockRef = useRef<ClockState | null>(null);
  const etagRef = useRef<string | null>(null);
  const pendingRef = useRef<PendingAction[]>([]);
  const flushing = useRef(false);
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

  // --- načtení z IndexedDB (neodeslané zápisy, hodiny) a uložený koridor ---
  useEffect(() => {
    let cancelled = false;
    const stored =
      canSwitch && typeof localStorage !== "undefined"
        ? Number(localStorage.getItem(CORRIDOR_KEY))
        : NaN;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration from localStorage on mount
    if (stored === 1 || stored === 2) setCorridor(stored);
    void Promise.all([
      loadValue<PendingAction[]>(`prestarter:pending:${userId}`),
      loadValue<ClockState>("prestarter:clock"),
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
    void loadValue<Snapshot>(`prestarter:snap:${corridor}`).then((cached) => {
      if (cancelled || !cached || cached.corridor !== corridor) return;
      setSnapshot((current) => snapshotForCorridor(current, corridor) ?? cached);
    });
    return () => {
      cancelled = true;
    };
  }, [corridor]);

  const persistPending = useCallback(
    (next: PendingAction[]) => {
      pendingRef.current = next;
      setPending(next);
      void saveValue(`prestarter:pending:${userId}`, next);
    },
    [userId],
  );

  // --- service worker (stránka jde otevřít i bez signálu) a wake lock ---
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/predstarter-sw.js", { scope: `/${locale}/predstarter` })
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

  // --- synchronizace hodin se serverem (/api/live/clock): dávka vzorků, pak pravidelně ---
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
      void saveValue("prestarter:clock", next);
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
    const timer = setInterval(() => setNow(serverNow()), 200);
    return () => clearInterval(timer);
  }, [serverNow]);

  // --- stahování startovky každé ~3 s ---
  const fetchSnapshot = useCallback(
    async (signal?: AbortSignal) => {
      const startedAt = Date.now();
      try {
        const response = await fetch(`${API}?corridor=${corridor}`, {
          cache: "no-store",
          signal,
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
        // přepnutý koridor: odpověď pro předchozí koridor zahodit (ani ETag, ani cache)
        if (!acceptsSnapshot(data, corridor, signal?.aborted)) return;
        etagRef.current = response.headers.get("etag");
        setOnline(true);
        setSnapshot(data);
        setAcked((list) => list.filter((entry) => entry.ackAt >= startedAt));
        void saveValue(`prestarter:snap:${data.corridor}`, data);
      } catch {
        if (!signal?.aborted) setOnline(false);
      }
    },
    [corridor],
  );

  useEffect(() => {
    // a corridor switch aborts the old poll, so its late answer never fills the new queue
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- start polling the start list (async fetch)
    void fetchSnapshot(controller.signal);
    const timer = setInterval(() => void fetchSnapshot(controller.signal), POLL_MS);
    const goOnline = () => void fetchSnapshot(controller.signal);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      controller.abort();
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
      const response = await fetch(`${API}?corridor=${corridor}`, {
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
        results: { id: string; outcome: string }[];
      };
      setOnline(true);
      const done = new Set(body.results.map((result) => result.id));
      const ackAt = Date.now();
      setAcked((list) => [
        ...list,
        ...batch.filter((entry) => done.has(entry.id)).map((entry) => ({ ...entry, ackAt })),
      ]);
      persistPending(pendingRef.current.filter((entry) => !done.has(entry.id)));
      if (body.results.some((result) => result.outcome === "rejected")) show(t("rejected"));
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
        snapshot.organizerShiftSeconds,
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
      PRESTARTER_SOURCE,
    );
  }, [snapshot, acked, pending, byBib, intervalS]);
  const redPhaseS = snapshot?.settings.redPhaseS ?? 5;
  const board = useMemo(
    () =>
      buildStarterView(runners, marks, now, {
        redPhaseS,
        dnsWindowS: snapshot?.settings.dnsWindowS ?? 300,
        intervalS,
        queueSize: PRESTARTER_QUEUE_SIZE,
      }),
    [runners, marks, now, redPhaseS, snapshot?.settings.dnsWindowS, intervalS],
  );
  const quality = clockQuality({
    uncertaintyMs: clock?.uncertainty ?? null,
    lastSyncAt: clock?.at ?? null,
    now: now - (clock?.offset ?? 0),
  });

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
      setLateBib(runner.bib);
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

  const openList = (value: ListFilter) => {
    scrolledRef.current = false;
    setFilter(value);
    setMissingOpen(false);
    setView("list");
  };

  // celá startovka: posun na čáru „TEĎ“ při otevření
  useEffect(() => {
    if (view !== "list") {
      scrolledRef.current = false;
      return;
    }
    if (scrolledRef.current || !listRef.current) return;
    const line = listRef.current.querySelector<HTMLElement>("[data-nowline]");
    if (line) listRef.current.scrollTop = line.offsetTop - listRef.current.offsetTop - 60 * 3;
    scrolledRef.current = true;
  });

  /** Kdo naposledy označil (když to nebylo toto zařízení / předstartér). */
  const markedBy = (bib: number): string | null => {
    const source = marks.get(bib)?.source;
    if (!source || source === PRESTARTER_SOURCE) return null;
    if (source === "starter") return t("byStarter");
    if (source === "admin") return t("byAdmin");
    return null;
  };

  // --- vykreslení ---
  /** Odpočet do startu: do hodiny `−4:59`, do dne „za 3 h 34 min“, dál datum (STG 27. 11.). */
  const countdownText = (remaining: number, plannedMs: number, short = false): string => {
    const countdown = prestartCountdown(remaining, plannedMs);
    if (countdown.kind === "clock") return countdown.text;
    // v celé startovce je plánovaný čas vlevo, stačí hrubý údaj, ať zůstane místo na jméno
    if (countdown.kind === "hours" && short) {
      return t(countdown.past ? "cdHoursShortAgo" : "cdHoursShort", { hours: countdown.hours });
    }
    if (countdown.kind === "hours") {
      return t(countdown.past ? "cdHoursAgo" : "cdHours", {
        hours: countdown.hours,
        minutes: countdown.minutes,
      });
    }
    return new Intl.DateTimeFormat(locale === "cs" ? "cs-CZ" : "en-GB", {
      timeZone: "Europe/Prague",
      day: "numeric",
      month: locale === "cs" ? "numeric" : "short",
    }).format(countdown.at);
  };
  const countdownLong = (remaining: number) => prestartCountdown(remaining, 0).kind !== "clock";
  const range = snapshot ? corridorRange(corridor, snapshot.secondStartFrom) : null;
  const pendingCount = pending.length;
  const allMissing = useMemo(
    () => buildStarterList(runners, marks, now, redPhaseS, "missing").reverse(),
    [runners, marks, now, redPhaseS],
  );

  const header = (
    <header className={styles.header}>
      <div className={styles.hrow}>
        <button
          type="button"
          className={styles.corr}
          onClick={switchCorridor}
          disabled={!canSwitch}
          data-testid="prestarter-corridor"
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
        <span className={styles.role}>{t("role")}</span>
        <div
          className={`${styles.conn} ${online ? "" : styles.connOff}`}
          data-testid="prestarter-conn"
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
      </div>
      <div className={styles.clockrow}>
        <div className={`${styles.clock} ${styles.num}`} data-testid="prestarter-clock">
          {hms(now)}
        </div>
        <div
          className={`${styles.acc} ${quality === "warn" ? styles.accWarn : quality === "none" ? styles.accNone : ""}`}
          data-testid="prestarter-accuracy"
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
        <div className={styles.toStart}>
          <span>{t("toStart")}</span>
          <b className={styles.num} data-testid="prestarter-count-up">
            {board.counts.toStart}
          </b>
        </div>
      </div>
    </header>
  );

  const offbar =
    !online && hydrated ? (
      <div className={styles.offbar} data-testid="prestarter-offbar">
        ⚠ {t("offbar", { count: pendingCount })}
      </div>
    ) : null;

  const queueView = (
    <div className={styles.view}>
      <div className={styles.queue} data-testid="prestarter-queue">
        {board.queue.map((row) => {
          const zoneClass =
            row.zone === "red"
              ? styles.red
              : row.zone === "now"
                ? styles.zNow
                : row.zone === "next"
                  ? styles.zNext
                  : styles.zLater;
          const remaining = row.plannedMs - now;
          const by = row.marked ? markedBy(row.bib) : null;
          return (
            <button
              type="button"
              key={row.bib}
              className={`${styles.tile} ${zoneClass} ${row.marked ? styles.marked : ""}`}
              onClick={() => tap(row)}
              data-testid={`prestarter-tile-${row.bib}`}
              data-zone={row.zone}
              data-marked={row.marked ? "1" : "0"}
            >
              <span className={`${styles.bib} ${styles.num}`}>{row.bib}</span>
              <span className={styles.mid}>
                <span className={styles.name}>{row.name}</span>
                <span className={`${styles.st} ${styles.num}`}>
                  {row.zone === "red" ? (
                    t("notMarked")
                  ) : row.marked ? (
                    <>
                      <span className={styles.markedTag}>{t("atStart")}</span>
                      {by ? <span className={styles.by}>{by}</span> : null}
                    </>
                  ) : (
                    hms(row.plannedMs)
                  )}
                </span>
              </span>
              <span
                className={`${styles.cd} ${styles.num} ${countdownLong(remaining) ? styles.cdLong : ""}`}
                data-testid={`prestarter-cd-${row.bib}`}
              >
                {countdownText(remaining, row.plannedMs)}
              </span>
              {row.zone === "red" ? (
                <span
                  className={styles.bar}
                  style={{
                    width: `${Math.max(0, Math.min(1, (row.plannedMs + redPhaseS * 1000 - now) / (redPhaseS * 1000 || 1))) * 100}%`,
                  }}
                />
              ) : null}
            </button>
          );
        })}
        {Array.from({ length: Math.max(0, PRESTARTER_QUEUE_SIZE - board.queue.length) }, (_, i) => (
          <div key={`empty-${i}`} className={styles.empty}>
            {board.queue.length === 0 && i === 0 && snapshot ? t("queueEmpty") : "—"}
          </div>
        ))}
      </div>
      <div className={styles.bottom}>
        <button
          type="button"
          className={`${styles.missBtn} ${board.counts.missing ? styles.missOn : ""}`}
          onClick={() => setMissingOpen(true)}
          data-testid="prestarter-missing-open"
          aria-expanded={missingOpen}
        >
          <span>{t("missing")}</span>
          <b className={styles.num} data-testid="prestarter-count-missing">
            {board.counts.missing}
          </b>
          <span aria-hidden>▴</span>
        </button>
        <button
          type="button"
          className={styles.listBtn}
          onClick={() => openList("all")}
          data-testid="prestarter-list-open"
        >
          ☰&nbsp;{t("fullList")}
        </button>
      </div>
    </div>
  );

  const folded = fold(query.trim());
  const listRows = buildStarterList(runners, marks, now, redPhaseS, filter).filter(
    (row) => !folded || String(row.bib).startsWith(folded) || fold(row.name).includes(folded),
  );
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
    return {
      className: `${styles.liUp} ${zone}`,
      label: countdownLong(remaining)
        ? countdownText(remaining, row.plannedMs, true)
        : t("stIn", { time: mmss(remaining) }),
    };
  };
  const nowlineIndex =
    filter === "all" && !folded ? listRows.findIndex((row) => row.plannedMs > now) : -1;
  const listView = (
    <div className={styles.view}>
      <div className={styles.listH}>
        <button type="button" className={styles.back} onClick={() => setView("queue")}>
          ‹ {t("back")}
        </button>
        <input
          type="search"
          className={styles.search}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("searchPlaceholder")}
          aria-label={t("searchPlaceholder")}
          enterKeyHint="search"
          autoComplete="off"
          data-testid="prestarter-search"
        />
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
      <div className={styles.list} ref={listRef} data-testid="prestarter-list">
        {listRows.length === 0 ? <div className={styles.listEmpty}>{t("listEmpty")}</div> : null}
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
                if (row.state === "missing") setLateBib(row.bib);
                else if (row.state !== "started") tap(row);
              }}
              data-testid={`prestarter-li-${row.bib}`}
              data-state={row.state}
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

  const missingSheet = missingOpen ? (
    <div className={styles.sheet} data-testid="prestarter-missing">
      <div className={styles.grab} />
      <div className={styles.sheetH}>
        {t("missingTitle", { count: allMissing.length })}
        <button
          type="button"
          className={styles.x}
          onClick={() => setMissingOpen(false)}
          aria-label={t("close")}
        >
          ✕
        </button>
      </div>
      <p className={styles.sheetHint}>{t("missingHint")}</p>
      <div className={styles.missList}>
        {allMissing.length ? (
          allMissing.map((runner) => (
            <button
              type="button"
              key={runner.bib}
              className={styles.missRow}
              onClick={() => setLateBib(runner.bib)}
              data-testid={`prestarter-dns-${runner.bib}`}
            >
              <span className={`${styles.missB} ${styles.num}`}>{runner.bib}</span>
              <span className={styles.missN}>
                <span>{runner.name}</span>
                <small className={styles.num}>
                  {t("missingPlanned", {
                    time: hms(runner.plannedMs),
                    offset: mmss(now - runner.plannedMs),
                  })}
                </small>
              </span>
              <span className={styles.missGo}>{t("startNow")}</span>
            </button>
          ))
        ) : (
          <div className={styles.listEmpty}>{t("missingEmpty")}</div>
        )}
      </div>
    </div>
  ) : null;

  const lateSheet = (() => {
    if (lateBib === null) return null;
    const runner = byBib.get(lateBib);
    const planned = runner?.plannedMs ?? now;
    const offset = offsetSeconds(now, planned);
    const late = runner ? isLateStart(now, planned, intervalS) : false;
    return (
      <div className={`${styles.sheet} ${styles.sheetTop}`} data-testid="prestarter-late">
        <div className={styles.grab} />
        <div className={styles.sheetH}>
          {t("lateTitle")}
          <button
            type="button"
            className={styles.x}
            onClick={() => setLateBib(null)}
            aria-label={t("close")}
          >
            ✕
          </button>
        </div>
        <div className={styles.ltBig}>
          <b className={styles.num}>{lateBib}</b>
          <span>{runner?.name ?? "—"}</span>
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
              <td className={late ? styles.lateTxt : undefined}>
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
            enqueue(lateBib, "late");
            setLateBib(null);
          }}
          data-testid="prestarter-late-confirm"
        >
          {t("startNowCaps")}
        </button>
        <button type="button" className={styles.ltCancel} onClick={() => setLateBib(null)}>
          {t("cancel")}
        </button>
      </div>
    );
  })();

  const overlay = missingOpen || lateBib !== null;

  return (
    <div className={styles.root} data-testid="prestarter-screen">
      {header}
      {offbar}
      {!snapshot ? (
        <div className={styles.loading}>{online ? t("loading") : t("noCache")}</div>
      ) : view === "queue" ? (
        queueView
      ) : (
        listView
      )}
      {overlay ? (
        <div
          className={styles.scrim}
          onClick={() => {
            if (lateBib !== null) setLateBib(null);
            else setMissingOpen(false);
          }}
          aria-hidden
        />
      ) : null}
      {missingSheet}
      {lateSheet}
      {toast ? (
        <div className={styles.toast} role="status">
          {toast}
        </div>
      ) : null}
    </div>
  );
}
