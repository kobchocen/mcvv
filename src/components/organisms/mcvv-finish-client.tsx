"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";

import { Link } from "@/i18n/routing";
import type { FinishOpResult } from "@/lib/live/finish-core";
import {
  addFinishBib,
  addFinishPunch,
  applyFinishAck,
  countFinish,
  deleteFinishRecord,
  dueFinishStations,
  EMPTY_FINISH_QUEUE,
  FINISH_STATIONS,
  finishQueueKey,
  nextFinishBatch,
  otherStationPending,
  reviveFinishQueue,
  scheduleFinishRetry,
  type FinishQueue,
  type StationKind,
  type StationRecord,
} from "@/lib/live/finish-queue-core";
import { clockSample, pickOffset } from "@/lib/live/queue-core";
import { loadValue, saveValue } from "@/lib/live/queue-store";

type Props = { year: number; userId: number; userName: string; locale: string };

const RECENT = 40;

const EMPTY_QUEUES: Record<StationKind, FinishQueue> = {
  watch: EMPTY_FINISH_QUEUE,
  bibs: EMPTY_FINISH_QUEUE,
};

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-4000-8000-${Math.random().toString(16).slice(2, 14)}`;
}

/** Razítko = hodiny zařízení + korekce proti serveru. */
function stampNow(offset: number): number {
  return Date.now() + offset;
}

/** hh:mm:ss.d v Europe/Prague (desetiny kvůli dvojicím ve stejné sekundě). */
function clockTenths(ms: number): string {
  const base = new Date(ms).toLocaleTimeString("cs-CZ", { timeZone: "Europe/Prague" });
  return `${base}.${Math.floor((ms % 1000) / 100)}`;
}

/**
 * Stanice v cíli (#252): Stopky (klik při průběhu cílovou čárou) a Čísla (opis čísel v pořadí
 * doběhu). Fronta v zařízení přežije výpadek sítě i zavření prohlížeče a dosynchronizuje se;
 * čas zařízení se koriguje proti serveru stejně jako na mezičasech.
 */
export function McvvFinishClient({ year, userId, userName, locale }: Props) {
  const t = useTranslations("Finish");
  const [kind, setKind] = useState<StationKind>("watch");
  const kindRef = useRef<StationKind>("watch");
  // fronty obou stanic – odesílají se obě bez ohledu na zvolenou stanici (#366)
  const [queues, setQueuesState] = useState<Record<StationKind, FinishQueue>>(EMPTY_QUEUES);
  const queuesRef = useRef<Record<StationKind, FinishQueue>>(EMPTY_QUEUES);
  const [loaded, setLoaded] = useState(false);
  const queue = queues[kind];
  const [offset, setOffset] = useState<number | null>(null);
  const offsetRef = useRef(0);
  const [online, setOnline] = useState(true);
  const [problem, setProblem] = useState<"login" | "forbidden" | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [input, setInput] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [now, setNow] = useState<number | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const inFlight = useRef<Set<string>>(new Set());
  const sending = useRef(false);

  const setQueue = useCallback(
    (station: StationKind, update: (state: FinishQueue) => FinishQueue) => {
      const next = update(queuesRef.current[station]);
      queuesRef.current = { ...queuesRef.current, [station]: next };
      setQueuesState(queuesRef.current);
      void saveValue(finishQueueKey(year, userId, station), next);
    },
    [year, userId],
  );

  useEffect(() => {
    kindRef.current = kind;
  }, [kind]);

  // uložená stanice a offset hodin
  useEffect(() => {
    void (async () => {
      const [savedKind, savedOffset] = await Promise.all([
        loadValue<StationKind>("finishStation"),
        loadValue<number>("clockOffset"),
      ]);
      if (savedKind === "watch" || savedKind === "bibs") setKind(savedKind);
      if (typeof savedOffset === "number") {
        offsetRef.current = savedOffset;
        setOffset(savedOffset);
      }
    })();
  }, []);

  // fronty obou stanic
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [watch, bibs] = await Promise.all(
        FINISH_STATIONS.map(async (station) =>
          reviveFinishQueue(await loadValue(finishQueueKey(year, userId, station))),
        ),
      );
      if (cancelled) return;
      queuesRef.current = { watch, bibs };
      setQueuesState(queuesRef.current);
      if (!navigator.onLine) setOnline(false);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [year, userId]);

  // service worker – stránka cíle se otevře i bez signálu (#366), API se necachuje
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/cil-sw.js", { scope: `/${locale}/cil` })
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

  // obrazovka nezhasne
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

  // korekce hodin proti serveru (vzorek s nejkratší odezvou)
  useEffect(() => {
    const samples: { offset: number; rtt: number }[] = [];
    const sync = async () => {
      try {
        const sentAt = Date.now();
        const response = await fetch("/api/live/clock", { cache: "no-store" });
        const receivedAt = Date.now();
        const body = (await response.json()) as { now: number };
        samples.push(clockSample(sentAt, receivedAt, body.now));
        if (samples.length > 5) samples.shift();
        const best = pickOffset(samples);
        if (best !== null) {
          offsetRef.current = best;
          setOffset(best);
          void saveValue("clockOffset", best);
        }
      } catch {
        // offline – platí poslední známý offset
      }
    };
    void sync();
    const id = window.setInterval(sync, 30_000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let id: number | undefined;
    const tick = () => {
      setNow(Date.now());
      id = window.setTimeout(tick, 250);
    };
    tick();
    return () => window.clearTimeout(id);
  }, []);

  const flushStation = useCallback(
    async (station: StationKind) => {
      const batch = nextFinishBatch(queuesRef.current[station]);
      if (batch.length === 0) return;
      batch.forEach((op) => inFlight.current.add(op.id));
      try {
        const response = await fetch("/api/live/finish", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ops: batch }),
          cache: "no-store",
          credentials: "same-origin",
        });
        if (response.ok) {
          const body = (await response.json()) as { results: FinishOpResult[] };
          setQueue(station, (s) => applyFinishAck(s, body.results));
          setOnline(true);
          setProblem(null);
          setLastSyncAt(Date.now());
        } else {
          if (response.status === 401) setProblem("login");
          if (response.status === 403) setProblem("forbidden");
          setOnline(response.status < 500 && response.status !== 429);
          setQueue(station, (s) => scheduleFinishRetry(s, Date.now()));
        }
      } catch {
        setOnline(false);
        setQueue(station, (s) => scheduleFinishRetry(s, Date.now()));
      } finally {
        batch.forEach((op) => inFlight.current.delete(op.id));
      }
    },
    [setQueue],
  );

  // odešle obě stanice (zvolenou první), každá má vlastní odstup po výpadku
  const flush = useCallback(async () => {
    if (sending.current) return;
    const due = dueFinishStations(queuesRef.current, Date.now(), kindRef.current);
    if (due.length === 0) return;
    sending.current = true;
    try {
      for (const station of due) await flushStation(station);
    } finally {
      sending.current = false;
    }
  }, [flushStation]);

  useEffect(() => {
    if (!loaded) return;
    const id = window.setInterval(() => void flush(), 1000);
    const wake = () => {
      for (const station of FINISH_STATIONS) setQueue(station, (s) => ({ ...s, nextAttemptAt: 0 }));
      void flush();
    };
    const offline = () => setOnline(false);
    window.addEventListener("online", wake);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", wake);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("online", wake);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [flush, loaded, setQueue]);

  const show = (message: string) => {
    setFlash(message);
    window.setTimeout(() => setFlash((current) => (current === message ? null : current)), 1500);
  };

  const punch = useCallback(() => {
    const at = stampNow(offsetRef.current);
    setQueue("watch", (s) => addFinishPunch(s, at, uuid));
    navigator.vibrate?.(25);
  }, [setQueue]);

  const submitBib = () => {
    const at = stampNow(offsetRef.current);
    const bib = Number(input);
    setInput("");
    if (!Number.isInteger(bib) || bib < 1 || bib > 999) return;
    setQueue("bibs", (s) => addFinishBib(s, bib, at, uuid));
    navigator.vibrate?.(25);
    show(t("bibSaved", { bib }));
  };

  // klávesnice: mezerník / Enter = klik (Stopky); číslice + Enter (Čísla)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (kind === "watch" && (event.code === "Space" || event.key === "Enter")) {
        event.preventDefault();
        punch();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [kind, punch]);

  const press = (key: string) => {
    if (key === "C") setInput("");
    else if (key === "⌫") setInput((value) => value.slice(0, -1));
    else if (key === "OK") submitBib();
    else setInput((value) => (value.length >= 3 ? value : (value + key).replace(/^0+/, "")));
  };

  const chooseKind = (next: StationKind) => {
    setKind(next);
    void saveValue("finishStation", next);
  };

  const remove = (record: StationRecord) => {
    if (confirmDelete !== record.id) {
      setConfirmDelete(record.id);
      return;
    }
    setQueue(record.kind === "punch" ? "watch" : "bibs", (s) =>
      deleteFinishRecord(s, record.id, uuid, inFlight.current),
    );
    setConfirmDelete(null);
  };

  const recordKind = kind === "watch" ? "punch" : "bib";
  const counts = countFinish(queue, recordKind);
  const rows = queue.records.filter((r) => r.kind === recordKind);
  const active = rows.filter((r) => r.state !== "deleted" && r.state !== "rejected");
  const order = new Map(
    [...active].sort((a, b) => a.at - b.at).map((r, index) => [r.id, index + 1]),
  );
  const pending = queue.outbox.length;
  const other = otherStationPending(queues, kind);
  const pendingAll = pending + (other?.count ?? 0);
  const stateClass = (r: StationRecord) =>
    r.state === "applied" || r.state === "duplicate"
      ? "border-race-accent/60 text-race-accent"
      : r.state === "pending"
        ? "border-sky-500/60 text-sky-600 dark:text-sky-300"
        : r.state === "deleted"
          ? "border-race-line text-race-muted line-through"
          : "border-red-500/60 text-red-600 dark:text-red-400";

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-3 pb-10 pt-4">
      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <Link
            href="/"
            className="inline-flex h-9 items-center text-sm font-semibold text-race-accent hover:underline"
          >
            ← mcvv.org
          </Link>
          <span
            data-testid="sync-status"
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              online && pendingAll === 0
                ? "border-race-accent/60 text-race-accent"
                : online
                  ? "border-sky-500/60 text-sky-600 dark:text-sky-300"
                  : "border-red-500/60 text-red-600 dark:text-red-400"
            }`}
          >
            {online ? t("online") : t("offline")} ·{" "}
            {other ? `${t(kind === "watch" ? "stationWatch" : "stationBibs")}: ` : ""}
            {t("queued", { count: pending })}
            {other
              ? ` · ${t("otherQueued", {
                  station: t(other.station === "watch" ? "stationWatch" : "stationBibs"),
                  count: other.count,
                })}`
              : ""}
          </span>
        </div>
        <div className="flex items-end justify-between gap-2">
          <h1 className="font-display text-2xl font-bold text-foreground dark:text-white">
            {t("title", { year })}
          </h1>
          <p className="font-display text-3xl font-bold leading-none tabular-nums text-foreground dark:text-white">
            <time suppressHydrationWarning>
              {now === null ? "--:--:--" : clockTenths(now + (offset ?? 0)).slice(0, 8)}
            </time>
          </p>
        </div>
        <div role="radiogroup" aria-label={t("station")} className="grid grid-cols-2 gap-2">
          {(["watch", "bibs"] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={value === kind}
              onClick={() => chooseKind(value)}
              className={`h-12 border text-base font-semibold ${
                value === kind
                  ? "border-race-accent bg-race-accent-solid text-white"
                  : "border-race-line/60 bg-race-surface text-foreground"
              }`}
            >
              {t(value === "watch" ? "stationWatch" : "stationBibs")}
            </button>
          ))}
        </div>
        <p className="border border-race-line/50 bg-race-surface px-3 py-2 text-sm">
          {t(kind === "watch" ? "countPunches" : "countBibs")}:{" "}
          <strong className="font-display text-lg tabular-nums">{counts.total}</strong>
          {counts.pending > 0 ? ` · ${t("countPending", { count: counts.pending })}` : ""}
          {counts.rejected > 0 ? ` · ${t("countRejected", { count: counts.rejected })}` : ""}
        </p>
        <p className="text-xs text-race-muted">
          {t("operator", { name: userName })} ·{" "}
          {offset === null ? t("clockUnknown") : t("clockOffset", { ms: offset })}
          {lastSyncAt ? ` · ${t("lastSync", { time: clockTenths(lastSyncAt).slice(0, 8) })}` : ""}
        </p>
        {problem ? (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {t(problem === "login" ? "problemLogin" : "problemForbidden")}
          </p>
        ) : null}
      </header>

      {kind === "watch" ? (
        <section className="flex flex-col gap-3">
          <button
            type="button"
            data-testid="finish-punch"
            onPointerDown={(event) => {
              event.preventDefault();
              punch();
            }}
            className="h-[42vh] min-h-56 w-full select-none bg-race-accent-solid font-display text-6xl font-bold text-white active:scale-[0.99] active:brightness-110"
          >
            {t("punch")}
          </button>
          <p className="text-xs text-race-muted">{t("watchHint")}</p>
        </section>
      ) : (
        <section className="flex flex-col gap-3">
          <output
            aria-live="polite"
            className="flex h-20 items-center justify-center border border-race-line/60 bg-race-surface font-display text-5xl font-bold tabular-nums"
          >
            {input || "–"}
          </output>
          <div className="grid grid-cols-3 gap-2">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⌫"].map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => press(key)}
                className="h-16 border border-race-line/60 bg-race-surface font-display text-2xl font-bold"
              >
                {key}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => press("OK")}
            className="h-16 bg-race-accent-solid font-display text-2xl font-bold text-white"
          >
            {t("bibOk")}
          </button>
          <p className="text-xs text-race-muted">{t("bibsHint")}</p>
        </section>
      )}

      {flash ? (
        <p role="status" className="text-center text-sm font-semibold text-race-accent">
          {flash}
        </p>
      ) : null}

      <section aria-label={t("recent")}>
        <h2 className="mb-2 font-display text-lg font-semibold">{t("recent")}</h2>
        <ul className="flex flex-col gap-1">
          {rows.slice(0, RECENT).map((record) => (
            <li
              key={record.id}
              className="flex items-center gap-2 border border-race-line/50 bg-race-surface px-3 py-2 text-sm"
            >
              <span className="w-10 tabular-nums text-race-muted">
                {order.has(record.id) ? `${order.get(record.id)}.` : ""}
              </span>
              {record.kind === "bib" ? (
                <strong className="w-14 font-display text-xl tabular-nums">{record.bib}</strong>
              ) : null}
              <span className="flex-1 tabular-nums">{clockTenths(record.at)}</span>
              <span
                className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${stateClass(record)}`}
              >
                {t(`state.${record.state}`)}
              </span>
              {record.state !== "deleted" && record.state !== "rejected" ? (
                <button
                  type="button"
                  onClick={() => remove(record)}
                  className="h-9 border border-red-500/60 px-2 text-xs font-semibold text-red-600 dark:text-red-400"
                >
                  {confirmDelete === record.id ? t("deleteConfirm") : t("delete")}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
