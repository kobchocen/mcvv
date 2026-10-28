"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  addPunch,
  applyAck,
  clockSample,
  correctBib,
  deleteRecord,
  EMPTY_QUEUE,
  findActiveBib,
  markFailed,
  nextBatch,
  pickOffset,
  scheduleRetry,
  type QueueState,
  type SplitRecord,
} from "@/lib/live/queue-core";
import { Link } from "@/i18n/routing";
import { loadQueue, loadValue, queueKey, saveValue } from "@/lib/live/queue-store";
import {
  correctedNow,
  countRecords,
  DEFAULT_START_OFFSET_LIMIT_S,
  formatStartOffsetLimit,
  RECENT_LIMIT,
  recentRecords,
  relativeTime,
} from "@/lib/live/splits-screen-core";
import { formatOffset } from "@/lib/live/start-check-core";
import { formatRaceTime } from "@/lib/live/start-time";
import { isStartStation, type Station } from "@/lib/live/stations";

type Props = {
  stations: Station[];
  year: number;
  userId: number;
  userName: string;
  zeroIso: string;
  intervalS: number;
  zeroOverridden: boolean;
  /** Práh odchylky na Startu v sekundách (nastavení admina, výchozí 2 min). */
  startLimitS?: number;
  locale: string;
};

type Problem = "login" | "forbidden" | null;

const MAX_BIB = 999;

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}-4000-8000-${Math.random().toString(16).slice(2, 14)}`;
}

/** Razítko = hodiny zařízení + korekce proti serveru. */
function stampNow(offset: number): number {
  return Date.now() + offset;
}

function clock(ms: number): string {
  return new Date(ms).toLocaleTimeString("cs-CZ", { timeZone: "Europe/Prague" });
}

export function McvvSplitsClient({
  stations,
  year,
  userId,
  userName,
  zeroIso,
  intervalS,
  zeroOverridden,
  startLimitS = DEFAULT_START_OFFSET_LIMIT_S,
  locale,
}: Props) {
  const t = useTranslations("Splits");
  const storageKey = queueKey(year, userId);
  const zero = useMemo(() => new Date(zeroIso), [zeroIso]);
  const [queue, setQueueState] = useState<QueueState>(EMPTY_QUEUE);
  const queueRef = useRef<QueueState>(EMPTY_QUEUE);
  const [loaded, setLoaded] = useState(false);
  const [station, setStation] = useState(stations[0]?.code ?? "1");
  const [input, setInput] = useState("");
  const [offset, setOffset] = useState<number | null>(null);
  const offsetRef = useRef(0);
  const [online, setOnline] = useState(true);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [problem, setProblem] = useState<Problem>(null);
  const [warning, setWarning] = useState<{ bib: number; at: number; existing: SplitRecord } | null>(
    null,
  );
  const [flash, setFlash] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [editBib, setEditBib] = useState("");
  const inFlight = useRef<Set<string>>(new Set());
  const sending = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  /** Běžící hodiny (#187); null do prvního tiku, aby SSR a klient nerenderovaly jiný čas. */
  const [now, setNow] = useState<number | null>(null);

  const setQueue = useCallback(
    (update: (state: QueueState) => QueueState) => {
      const next = update(queueRef.current);
      queueRef.current = next;
      setQueueState(next);
      void saveValue(storageKey, next);
    },
    [storageKey],
  );

  // načtení uložené fronty, stanoviště a posledního offsetu hodin
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [stored, savedStation, savedOffset] = await Promise.all([
        loadQueue(storageKey),
        loadValue<string>("station"),
        loadValue<number>("clockOffset"),
      ]);
      if (cancelled) return;
      queueRef.current = stored;
      setQueueState(stored);
      if (savedStation && stations.some((s) => s.code === savedStation)) setStation(savedStation);
      if (typeof savedOffset === "number") {
        offsetRef.current = savedOffset;
        setOffset(savedOffset);
      }
      if (!navigator.onLine) setOnline(false);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [storageKey, stations]);

  // service worker – stránka se otevře i bez signálu
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker
      .register("/mezicasy-sw.js", { scope: `/${locale}/mezicasy` })
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

  // obrazovka nezhasne, dokud je stránka otevřená
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

  // korekce hodin zařízení proti serveru
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
        // offline – použije se poslední známý offset
      }
    };
    void sync();
    const id = window.setInterval(sync, 60_000);
    return () => window.clearInterval(id);
  }, []);

  // běžící aktuální čas – tik zarovnaný na celou sekundu
  useEffect(() => {
    let id: number | undefined;
    const tick = () => {
      setNow(Date.now());
      id = window.setTimeout(tick, 1000 - (Date.now() % 1000) + 5);
    };
    tick();
    return () => window.clearTimeout(id);
  }, []);

  const flush = useCallback(async () => {
    const state = queueRef.current;
    if (sending.current || state.outbox.length === 0 || Date.now() < state.nextAttemptAt) return;
    const batch = nextBatch(state);
    sending.current = true;
    batch.forEach((entry) => inFlight.current.add(entry.id));
    try {
      const response = await fetch("/api/live/splits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: batch }),
        cache: "no-store",
        credentials: "same-origin",
      });
      if (response.ok) {
        const body = (await response.json()) as { results: Parameters<typeof applyAck>[1] };
        setQueue((s) => applyAck(s, body.results));
        setOnline(true);
        setProblem(null);
        setLastSyncAt(Date.now());
      } else if (response.status === 422) {
        setQueue((s) =>
          markFailed(
            s,
            batch.map((entry) => entry.id),
          ),
        );
        setOnline(true);
      } else {
        if (response.status === 401) setProblem("login");
        if (response.status === 403) setProblem("forbidden");
        setOnline(response.status < 500 && response.status !== 429);
        setQueue((s) => scheduleRetry(s, Date.now()));
      }
    } catch {
      setOnline(false);
      setQueue((s) => scheduleRetry(s, Date.now()));
    } finally {
      batch.forEach((entry) => inFlight.current.delete(entry.id));
      sending.current = false;
    }
  }, [setQueue]);

  useEffect(() => {
    if (!loaded) return;
    const id = window.setInterval(() => void flush(), 1000);
    const wake = () => {
      setQueue((s) => ({ ...s, nextAttemptAt: 0 }));
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
    window.setTimeout(() => setFlash((current) => (current === message ? null : current)), 2500);
  };

  const record = (bib: number, at: number, force = false) => {
    const existing = findActiveBib(queueRef.current, station, bib);
    if (existing && !force) {
      setWarning({ bib, at, existing });
      return;
    }
    setWarning(null);
    setQueue((s) => addPunch(s, { split: station, bib, punchedAt: at }, uuid));
    navigator.vibrate?.(30);
    show(t("saved", { bib, time: clock(at) }));
  };

  const submit = () => {
    const at = stampNow(offsetRef.current); // razítko v okamžiku potvrzení
    const bib = Number(input);
    setInput("");
    inputRef.current?.focus();
    if (!Number.isInteger(bib) || bib < 1 || bib > MAX_BIB) return;
    record(bib, at);
  };

  const stampOnly = () => {
    const at = stampNow(offsetRef.current);
    setQueue((s) => addPunch(s, { split: station, bib: null, punchedAt: at }, uuid));
    navigator.vibrate?.(30);
    show(t("stamped", { time: clock(at) }));
  };

  const press = (key: string) => {
    if (key === "C") setInput("");
    else if (key === "⌫") setInput((value) => value.slice(0, -1));
    else if (key === "OK") submit();
    else setInput((value) => (value.length >= 3 ? value : (value + key).replace(/^0+/, "")));
  };

  const chooseStation = (code: string) => {
    setStation(code);
    void saveValue("station", code);
  };

  const saveEdit = (target: SplitRecord) => {
    const bib = Number(editBib);
    if (!Number.isInteger(bib) || bib < 1 || bib > MAX_BIB) return;
    setQueue((s) => correctBib(s, target.id, bib, uuid, inFlight.current));
    setEditing(null);
  };

  const remove = (target: SplitRecord) => {
    setQueue((s) => deleteRecord(s, target.id, uuid, inFlight.current));
    setEditing(null);
  };

  const visible = recentRecords(queue.records, station);
  const counts = countRecords(queue.records, station);
  const stationRows = queue.records.filter((r) => r.split === station).length;
  const pending = queue.outbox.length;
  const drafts = queue.records.filter((r) => r.state === "draft" && r.split === station).length;
  const stationLabel = stations.find((s) => s.code === station)?.label ?? station;
  const atStart = isStartStation(station);
  /** Start (#203): odchylka od plánovaného startu; mezičas: čas od startu. */
  const showTime = (seconds: number) => (atStart ? formatOffset(seconds) : formatRaceTime(seconds));
  /** Čas u zápisu (#187): před startem / jiný den se nesmyslné číslo nezobrazí. */
  const relativeFor = (r: SplitRecord & { bib: number }) => {
    const rel = relativeTime({
      atStart,
      zero,
      intervalS,
      bib: r.bib,
      punchedAt: r.punchedAt,
      serverTime: r.time,
      startLimitS,
    });
    if (rel.kind === "time") return rel.estimate ? `≈ ${rel.text}` : rel.text;
    if (rel.kind === "before-start") {
      // „odmítnuto: před startem“ už říká štítek – druhý text by byl navíc
      return r.state === "rejected" && r.note?.startsWith("before-start") ? null : t("beforeStart");
    }
    if (rel.kind === "too-long") {
      return r.state === "rejected" && r.note?.startsWith("too-long") ? null : t("outsideRace");
    }
    const limit = formatStartOffsetLimit(startLimitS);
    return rel.kind === "start-far-early"
      ? t("startFarEarly", { limit })
      : t("startFarLate", { limit });
  };

  const stateLabel = (r: SplitRecord) => {
    if (r.state === "applied" && r.note?.includes("unknown-bib")) return t("state.unknownBib");
    if (r.state === "rejected" && r.note)
      return t("state.rejectedReason", { reason: t(`reason.${r.note.split(";")[0]}` as never) });
    return t(`state.${r.state}` as never);
  };
  const stateClass = (r: SplitRecord) =>
    r.state === "applied"
      ? r.note?.includes("unknown-bib")
        ? "border-amber-500/60 text-amber-600 dark:text-amber-300"
        : "border-race-accent/60 text-race-accent"
      : r.state === "pending" || r.state === "draft"
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
            data-testid="back-link"
            aria-label={t("backAria")}
            className="inline-flex h-9 items-center text-sm font-semibold text-race-accent hover:underline"
          >
            ← mcvv.org
          </Link>
          <span
            data-testid="sync-status"
            className={`rounded-full border px-3 py-1 text-xs font-semibold ${
              online && pending === 0
                ? "border-race-accent/60 text-race-accent"
                : online
                  ? "border-sky-500/60 text-sky-600 dark:text-sky-300"
                  : "border-red-500/60 text-red-600 dark:text-red-400"
            }`}
          >
            {online ? t("online") : t("offline")} · {t("queued", { count: pending })}
          </span>
        </div>
        <div className="flex items-end justify-between gap-2">
          <h1 className="font-display text-2xl font-bold text-foreground dark:text-white">
            {t("title", { year })}
          </h1>
          <div className="text-right" data-testid="clock">
            <p
              aria-label={t("now")}
              className="font-display text-3xl font-bold leading-none tabular-nums text-foreground dark:text-white"
            >
              <time suppressHydrationWarning>
                {now === null ? "--:--:--" : clock(correctedNow(now, offset))}
              </time>
            </p>
            <p className="mt-1 text-[11px] text-race-muted">
              {offset === null ? t("clockDevice") : t("clockCorrected")}
            </p>
          </div>
        </div>
        <div role="radiogroup" aria-label={t("station")} className="grid grid-cols-2 gap-2">
          {stations.map((s) => (
            <button
              key={s.code}
              type="button"
              role="radio"
              aria-checked={s.code === station}
              onClick={() => chooseStation(s.code)}
              className={`h-12 border text-base font-semibold ${
                s.code === station
                  ? "border-race-accent bg-race-accent-solid text-white"
                  : "border-race-line/60 bg-race-surface text-foreground"
              }`}
            >
              {isStartStation(s.code)
                ? t("startStation")
                : t("stationLabel", { label: s.label, code: s.code })}
            </button>
          ))}
        </div>
        <p
          data-testid="counts"
          className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border border-race-line/50 bg-race-surface px-3 py-2 text-sm"
        >
          <span>
            {atStart ? t("startStation") : stationLabel}:{" "}
            <strong className="font-display text-lg tabular-nums">{counts.station}</strong>{" "}
            {t("countRecorded", { count: counts.station })}
            {counts.stationSent !== counts.station
              ? ` (${t("countSaved", { count: counts.stationSent })})`
              : ""}
          </span>
          <span className="text-race-muted">
            {t("countTotalSent")}:{" "}
            <strong className="font-display text-lg tabular-nums text-foreground">
              {counts.totalSent}
            </strong>
          </span>
        </p>
        <p className="text-xs text-race-muted">
          {t("operator", { name: userName })} ·{" "}
          {offset === null ? t("clockUnknown") : t("clockOffset", { ms: offset })}
          {lastSyncAt ? ` · ${t("lastSync", { time: clock(lastSyncAt) })}` : ""}
          {zeroOverridden ? ` · ${t("testZero", { time: clock(zero.getTime()) })}` : ""}
        </p>
        {atStart ? (
          <p
            data-testid="start-hint"
            className="border border-sky-500/50 bg-sky-500/10 p-2 text-xs text-foreground"
          >
            {t("startHint")}{" "}
            <span data-testid="start-limit">
              {t("startLimit", { limit: formatStartOffsetLimit(startLimitS) })}
            </span>
          </p>
        ) : null}
        {problem ? (
          <p
            role="alert"
            className="border border-red-500/60 p-3 text-sm text-red-600 dark:text-red-400"
          >
            {problem === "login" ? t("problemLogin") : t("problemForbidden")}{" "}
            {problem === "login" ? (
              <a
                className="underline"
                href={`/${locale}/prihlaseni?next=/${locale}/mezicasy`}
                target="_blank"
                rel="noreferrer"
              >
                {t("loginLink")}
              </a>
            ) : null}
          </p>
        ) : null}
      </header>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        className="flex items-stretch gap-2"
      >
        <label htmlFor="bib" className="sr-only">
          {t("bib")}
        </label>
        <input
          ref={inputRef}
          id="bib"
          data-testid="bib-input"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          autoFocus
          value={input}
          onChange={(event) => setInput(event.target.value.replace(/\D/g, "").slice(0, 3))}
          placeholder={t("bibPlaceholder")}
          className="h-20 w-full min-w-0 border border-race-line/60 bg-race-surface text-center font-display text-5xl font-bold tabular-nums text-foreground dark:text-white"
        />
        <button
          type="submit"
          data-testid="submit"
          className="h-20 w-28 shrink-0 bg-race-accent-solid font-display text-xl font-bold text-white hover:bg-race-accent-solid-hover"
        >
          {t("submit")}
        </button>
      </form>

      <div className="grid grid-cols-3 gap-2" aria-hidden="true">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "C", "0", "⌫"].map((key) => (
          <button
            key={key}
            type="button"
            tabIndex={-1}
            onClick={() => press(key)}
            className="h-16 border border-race-line/60 bg-race-surface font-display text-3xl font-semibold text-foreground active:bg-race-accent/20 dark:text-white"
          >
            {key}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={stampOnly}
        className="h-12 border border-dashed border-race-line bg-transparent text-sm font-semibold text-foreground"
      >
        {t("stampOnly")}
        {drafts > 0 ? ` (${t("drafts", { count: drafts })})` : ""}
      </button>

      <p aria-live="polite" className="min-h-6 text-center text-sm font-semibold text-race-accent">
        {flash}
      </p>

      {warning ? (
        <div
          role="alert"
          className="grid gap-2 border border-amber-500/70 bg-amber-500/10 p-3 text-sm"
        >
          <p>
            {t("duplicateWarning", {
              bib: warning.bib,
              time: clock(warning.existing.punchedAt),
              station: stationLabel,
            })}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              className="h-10 flex-1 border border-race-line bg-race-surface font-semibold"
              onClick={() => record(warning.bib, warning.at, true)}
            >
              {t("recordAnyway")}
            </button>
            <button
              type="button"
              className="h-10 flex-1 bg-race-accent-solid font-semibold text-white"
              onClick={() => setWarning(null)}
            >
              {t("cancel")}
            </button>
          </div>
        </div>
      ) : null}

      <section aria-label={t("recent")} className="grid gap-1">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-race-muted">
          {t("recent")} – {stationLabel}
          {stationRows > RECENT_LIMIT ? (
            <span className="ml-1 normal-case tracking-normal">
              ({t("recentLimit", { limit: RECENT_LIMIT, count: stationRows })})
            </span>
          ) : null}
        </h2>
        {visible.length === 0 ? <p className="text-sm text-race-muted">{t("empty")}</p> : null}
        <ul className="grid gap-1" data-testid="records">
          {visible.map((r) => {
            const relative = r.bib !== null ? relativeFor({ ...r, bib: r.bib }) : null;
            return (
              <li key={r.id} className="border border-race-line/50 bg-race-surface">
                <button
                  type="button"
                  disabled={r.state === "deleted"}
                  onClick={() => {
                    setEditing(editing === r.id ? null : r.id);
                    setEditBib(r.bib ? String(r.bib) : "");
                  }}
                  className="grid w-full grid-cols-[4rem_1fr_auto] items-center gap-2 px-3 py-2 text-left"
                >
                  <span className="font-display text-2xl font-bold tabular-nums">
                    {r.bib ?? "?"}
                  </span>
                  <span className="text-xs text-race-muted">
                    {clock(r.punchedAt)}
                    {relative ? (
                      <span className="ml-2 font-semibold text-foreground">{relative}</span>
                    ) : null}
                    {r.state === "duplicate" && typeof r.existingTime === "number"
                      ? ` · ${t("existing", { time: showTime(r.existingTime) })}`
                      : ""}
                  </span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${stateClass(r)}`}
                  >
                    {stateLabel(r)}
                  </span>
                </button>
                {editing === r.id ? (
                  <div className="grid grid-cols-[1fr_auto_auto] gap-2 border-t border-race-line/50 p-2">
                    <input
                      inputMode="numeric"
                      aria-label={t("newBib")}
                      value={editBib}
                      onChange={(event) =>
                        setEditBib(event.target.value.replace(/\D/g, "").slice(0, 3))
                      }
                      className="h-11 min-w-0 border border-race-line/60 bg-race-surface px-2 text-center text-xl font-semibold tabular-nums"
                    />
                    <button
                      type="button"
                      onClick={() => saveEdit(r)}
                      className="h-11 bg-race-accent-solid px-3 text-sm font-semibold text-white"
                    >
                      {r.state === "draft" ? t("assign") : t("correct")}
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(r)}
                      className="h-11 border border-red-500/60 px-3 text-sm font-semibold text-red-600 dark:text-red-400"
                    >
                      {t("delete")}
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
