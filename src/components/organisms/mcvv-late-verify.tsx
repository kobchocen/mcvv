"use client";

import { useActionState, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { verifyLatePayment, type VerifyPaymentState } from "@/lib/payments/verify-actions";

/** Odpočet do dalšího povoleného ověření (s), 0 = lze ověřit. */
function useCooldown(state: VerifyPaymentState): number {
  const [left, setLeft] = useState(0);
  useEffect(() => {
    if (!state.at || !state.retryIn) return;
    const until = state.at + state.retryIn * 1000;
    const tick = () => setLeft(Math.max(0, Math.ceil((until - Date.now()) / 1000)));
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [state.at, state.retryIn]);
  return left;
}

/**
 * „Zaplatil(a) jsem – ověřit platbu“ (mockup dohlaska c): hned se zeptá banky. Max. 1× za 30 s;
 * po odpovědi se tlačítko na zbytek intervalu zamkne s odpočtem.
 */
export function McvvLateVerify({
  year,
  registrationId,
  lastCheck,
  copy,
}: {
  year: number;
  registrationId: number;
  /** Předformátovaný čas poslední kontroly banky (Praha), nebo null. */
  lastCheck: string | null;
  copy: {
    button: string;
    pending: string;
    limit: string;
    lastCheck: string;
    retryIn: string;
    paid: string;
    notYet: string;
    wait: string;
    error: string;
    invalid: string;
  };
}) {
  const [state, action, pending] = useActionState<VerifyPaymentState, FormData>(
    verifyLatePayment,
    {},
  );
  const left = useCooldown(state);
  const message =
    state.result === "paid"
      ? copy.paid
      : state.result === "not_yet"
        ? copy.notYet
        : state.result === "wait"
          ? copy.wait
          : state.result === "error"
            ? copy.error
            : state.result === "invalid"
              ? copy.invalid
              : null;
  return (
    <form action={action} className="grid gap-2">
      <input type="hidden" name="year" value={year} />
      <input type="hidden" name="registrationId" value={registrationId} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending || left > 0}>
          {pending ? copy.pending : copy.button}
        </Button>
        <span className="text-xs text-race-muted">
          {left > 0 ? copy.retryIn.replace("{seconds}", String(left)) : copy.limit}
        </span>
      </div>
      {message ? (
        <p role="status" aria-live="polite" className="text-sm">
          {message}
        </p>
      ) : null}
      {lastCheck ? (
        <p className="text-xs text-race-muted">{copy.lastCheck.replace("{time}", lastCheck)}</p>
      ) : null}
    </form>
  );
}
