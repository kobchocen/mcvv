"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** setTimeout cannot wait longer than ~24.8 days (2^31 - 1 ms). */
const MAX_TIMEOUT_MS = 2_147_483_647;

/**
 * Refreshes the server-rendered page once `targetMs` is reached (e.g. the race start,
 * when the homepage hero switches to online results). Renders nothing.
 */
export function McvvRefreshAt({ targetMs }: { targetMs: number }) {
  const router = useRouter();
  useEffect(() => {
    const delay = targetMs - Date.now();
    if (delay <= 0 || delay > MAX_TIMEOUT_MS) {
      return;
    }
    // Small jitter so that all open tabs do not hit the server in the same second.
    const id = window.setTimeout(() => router.refresh(), delay + Math.random() * 5_000);
    return () => window.clearTimeout(id);
  }, [router, targetMs]);
  return null;
}
