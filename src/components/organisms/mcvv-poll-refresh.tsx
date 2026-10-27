"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Pravidelně obnoví serverovou stránku (např. detail nezaplacené prodejky čeká na
 * spárování platby z Fio). Jen když je karta vidět. Nic nevykresluje.
 */
export function McvvPollRefresh({ intervalMs }: { intervalMs: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [router, intervalMs]);
  return null;
}
