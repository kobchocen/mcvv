"use client";

import { useEffect, useRef, useState } from "react";

import type { ResultboardInfo } from "@/lib/live/resultboard";
import { RESULTBOARD_CONFIG_POLL_MS } from "@/lib/live/resultboard-core";

/**
 * Nastavení resultboardu a partneři (`/api/live/resultboard`) – obrazovky i speaker si je
 * znovu načtou každých 30 s (ETag → 304), takže změna v administraci se projeví bez reloadu.
 */
export function useResultboardInfo(initial: ResultboardInfo, initialEtag: string) {
  const [info, setInfo] = useState(initial);
  const etagRef = useRef(initialEtag);

  useEffect(() => {
    let stopped = false;
    const poll = async () => {
      if (document.visibilityState === "hidden") return;
      try {
        const response = await fetch("/api/live/resultboard", {
          cache: "no-store",
          headers: { "If-None-Match": etagRef.current },
        });
        if (response.status === 200 && !stopped) {
          const body = (await response.json()) as ResultboardInfo;
          etagRef.current = response.headers.get("ETag") ?? "";
          setInfo(body);
        }
      } catch {
        // bez spojení – zůstává poslední nastavení
      }
    };
    const id = window.setInterval(poll, RESULTBOARD_CONFIG_POLL_MS);
    return () => {
      stopped = true;
      window.clearInterval(id);
    };
  }, []);

  return info;
}
