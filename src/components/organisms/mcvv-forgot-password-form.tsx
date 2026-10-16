"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { requestPasswordReset, type ForgotState } from "@/lib/auth/reset-actions";

export type McvvForgotPasswordCopy = {
  email: string;
  submit: string;
  sent: string;
  mail: string;
};

const initial: ForgotState = {};

export function McvvForgotPasswordForm({ copy }: { copy: McvvForgotPasswordCopy }) {
  const [state, action, pending] = useActionState(requestPasswordReset, initial);

  if (state.sent) {
    return (
      <p role="status" className="text-base leading-7 text-race-muted">
        {copy.sent}
      </p>
    );
  }

  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="email">{copy.email}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          className="h-11 bg-race-surface"
        />
      </div>
      {state.error ? <p className="text-sm text-destructive">{copy.mail}</p> : null}
      <Button
        type="submit"
        disabled={pending}
        className="h-11 bg-race-accent font-display font-semibold text-white hover:bg-race-accent-hover"
      >
        {copy.submit}
      </Button>
    </form>
  );
}
