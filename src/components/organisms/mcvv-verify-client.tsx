"use client";

import { useActionState, useEffect, useRef } from "react";

import { consumeVerificationToken, type VerifyState } from "@/lib/auth/verify-action";

export function McvvVerifyClient({ token, errorLabel }: { token: string; errorLabel: string }) {
  const [state, action] = useActionState(consumeVerificationToken, {} as VerifyState);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) {
      return;
    }
    started.current = true;
    const data = new FormData();
    data.set("token", token);
    action(data);
  }, [action, token]);

  if (state.error) {
    return <p className="text-base leading-7 text-destructive">{errorLabel}</p>;
  }
  return <p className="text-base leading-7 text-race-muted">…</p>;
}
