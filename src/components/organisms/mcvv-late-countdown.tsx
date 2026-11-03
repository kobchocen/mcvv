"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/** Jak často se platební obrazovka sama obnoví (stav platby z DB). */
const REFRESH_MS = 20_000;

function format(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Odpočet do konce lhůty na zaplacení pozdní přihlášky a průběžné obnovení stránky
 * (polling ~20 s), aby se zaplacení / zrušení projevilo bez ručního obnovení.
 */
export function McvvLateCountdown({
  submittedAt,
  payUntil,
  label,
}: {
  submittedAt: string;
  payUntil: string;
  label: string;
}) {
  const router = useRouter();
  const start = new Date(submittedAt).getTime();
  const end = new Date(payUntil).getTime();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const refresh = setInterval(() => router.refresh(), REFRESH_MS);
    return () => {
      clearInterval(tick);
      clearInterval(refresh);
    };
  }, [router]);
  const left = Math.max(0, Math.floor((end - now) / 1000));
  const total = Math.max(1, end - start);
  const share = Math.min(100, Math.max(0, ((end - now) / total) * 100));
  return (
    <div className="grid gap-2">
      <div className="text-xs font-semibold uppercase tracking-[0.08em] text-amber-700 dark:text-amber-300">
        {label}
      </div>
      <div
        className="font-display text-4xl font-bold tabular-nums text-foreground dark:text-white"
        role="timer"
        aria-live="off"
        suppressHydrationWarning
      >
        {format(left)}
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-race-line/50">
        <i
          className="block h-full bg-amber-500"
          style={{ width: `${share}%` }}
          suppressHydrationWarning
        />
      </div>
    </div>
  );
}
