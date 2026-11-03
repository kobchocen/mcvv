"use client";

import { useEffect, useState } from "react";

import { minutesSeconds } from "@/lib/slots/admin-overview";

/**
 * Zbývající čas lhůty pozdní přihlášky v admin seznamu (m:ss, tiká po sekundě). Po lhůtě
 * ukáže `overdueLabel`; skutečný stav po obnovení stránky.
 */
export function McvvAdminLateTimer({
  payUntil,
  template,
  overdueLabel,
}: {
  payUntil: string;
  /** Text se zástupcem `{time}`, např. „čeká {time}“. */
  template: string;
  overdueLabel: string;
}) {
  const end = new Date(payUntil).getTime();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(tick);
  }, []);
  const left = Math.floor((end - now) / 1000);
  return (
    <span className="tabular-nums" suppressHydrationWarning>
      {left > 0 ? template.replace("{time}", minutesSeconds(left)) : overdueLabel}
    </span>
  );
}
