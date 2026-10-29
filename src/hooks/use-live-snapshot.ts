"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { nextPollDelay, parseRetryAfter } from "@/lib/live/poll-core";
import { clockSample, pickOffset } from "@/lib/live/queue-core";

/** Bez úspěšné odpovědi déle než tohle → „bez spojení“. */
export const LIVE_STALE_MS = 15_000;
const CLOCK_SYNC_MS = 60_000;

/**
 * Živý snímek pro speakera (#188) i veřejné online výsledky: hodiny srovnané se serverem
 * (`/api/live/clock`, #187), tik po celých sekundách a polling `url` každých 5 s
 * s `If-None-Match` (304 = beze změny). Skrytá záložka se neptá (Page Visibility API), po
 * návratu se zeptá hned; po chybě backoff až na 60 s (viz `nextPollDelay`). Všechno, co
 * závisí na „teď“, počítá volající z `nowMs`.
 */
export function useLiveSnapshot<T>(
  url: string,
  initial: T,
  initialEtag: string,
  /** Čas serveru při vykreslení – první render klienta je tak shodný se serverem. */
  serverNowMs: number,
) {
  const [snapshot, setSnapshot] = useState(initial);
  const [offset, setOffset] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(serverNowMs);
  const [updatedMs, setUpdatedMs] = useState(serverNowMs);
  const etagRef = useRef(initialEtag);
  const offsetRef = useRef<number>(0);

  const correctedNow = useCallback(() => Date.now() + offsetRef.current, []);

  // korekce hodin zařízení proti serveru (#187)
  useEffect(() => {
    // do první synchronizace odhad podle času vykreslení na serveru
    offsetRef.current = serverNowMs - Date.now();
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
        }
      } catch {
        // bez spojení – zůstává poslední offset
      }
    };
    void sync();
    const id = window.setInterval(sync, CLOCK_SYNC_MS);
    return () => window.clearInterval(id);
  }, [serverNowMs]);

  // tik hodin zarovnaný na celé sekundy
  useEffect(() => {
    let timer = 0;
    const tick = () => {
      const now = correctedNow();
      setNowMs(now);
      timer = window.setTimeout(tick, 1000 - (now % 1000) + 5);
    };
    tick();
    return () => window.clearTimeout(timer);
  }, [correctedNow, offset]);

  // polling dat s If-None-Match; jen viditelná záložka, po chybě backoff
  useEffect(() => {
    let timer = 0;
    let stopped = false;
    let running = false;
    let failures = 0;
    const schedule = (delay: number) => {
      window.clearTimeout(timer);
      if (!stopped && document.visibilityState !== "hidden") {
        timer = window.setTimeout(poll, delay);
      }
    };
    const poll = async () => {
      if (running) return;
      running = true;
      let retryAfter: number | null = null;
      try {
        const response = await fetch(url, {
          cache: "no-store",
          headers: { "If-None-Match": etagRef.current },
        });
        if (response.status === 200) {
          const body = (await response.json()) as T;
          etagRef.current = response.headers.get("ETag") ?? "";
          setSnapshot(body);
          setUpdatedMs(correctedNow());
          failures = 0;
        } else if (response.status === 304) {
          setUpdatedMs(correctedNow());
          failures = 0;
        } else {
          failures += 1;
          retryAfter = parseRetryAfter(response.headers.get("Retry-After"));
        }
      } catch {
        failures += 1; // bez spojení
      } finally {
        running = false;
      }
      schedule(nextPollDelay(failures, retryAfter, Math.random()));
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") window.clearTimeout(timer);
      else schedule(failures > 0 ? nextPollDelay(failures, null, Math.random()) : 0);
    };
    document.addEventListener("visibilitychange", onVisibility);
    schedule(nextPollDelay(0, null, Math.random()));
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [correctedNow, url]);

  return { snapshot, nowMs, updatedMs, stale: nowMs - updatedMs > LIVE_STALE_MS };
}
