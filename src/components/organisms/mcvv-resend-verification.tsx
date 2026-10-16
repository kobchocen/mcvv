"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resendVerification } from "@/lib/auth/register-actions";

export type McvvResendVerificationCopy = {
  email: string;
  resend: string;
  sent: string;
  error: string;
};

export function McvvResendVerification({ copy }: { copy: McvvResendVerificationCopy }) {
  const [state, action, pending] = useActionState(resendVerification, {});

  if (state.sent) {
    return (
      <p role="status" className="text-sm text-race-muted">
        {copy.sent}
      </p>
    );
  }

  return (
    <form action={action} className="grid gap-3">
      <div className="grid gap-2">
        <Label htmlFor="resend-email">{copy.email}</Label>
        <Input
          id="resend-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="h-11 bg-race-surface"
        />
      </div>
      {state.error ? <p className="text-sm text-destructive">{copy.error}</p> : null}
      <Button
        type="submit"
        disabled={pending}
        variant="outline"
        className="h-11 w-full border-race-line bg-race-surface font-display font-semibold"
      >
        {copy.resend}
      </Button>
    </form>
  );
}
