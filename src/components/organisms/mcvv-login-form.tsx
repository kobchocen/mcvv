"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login, type LoginState } from "@/lib/auth/actions";
import { resendVerification } from "@/lib/auth/register-actions";

export type McvvLoginFormCopy = {
  email: string;
  password: string;
  submit: string;
  error: string;
  unverified: string;
  resend: string;
  sent: string;
};

export type McvvLoginFormProps = {
  copy: McvvLoginFormCopy;
};

const initial: LoginState = {};

export function McvvLoginForm({ copy }: McvvLoginFormProps) {
  const [state, action, pending] = useActionState(login, initial);
  const [resendState, resendAction, resendPending] = useActionState(resendVerification, {});

  if (state.unverified) {
    return (
      <div className="grid gap-4">
        <p className="text-sm text-destructive">{copy.unverified}</p>
        {resendState.sent ? <p className="text-sm text-race-muted">{copy.sent}</p> : null}
        {resendState.error === "mail" ? (
          <p className="text-sm text-destructive">{copy.error}</p>
        ) : null}
        <form action={resendAction}>
          <input type="hidden" name="email" value={state.email} />
          <Button
            type="submit"
            disabled={resendPending}
            variant="outline"
            className="h-11 w-full border-race-line bg-race-surface font-display font-semibold"
          >
            {copy.resend}
          </Button>
        </form>
      </div>
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
          autoComplete="username"
          required
          className="h-11 bg-race-surface"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">{copy.password}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-11 bg-race-surface"
        />
      </div>
      {state.error ? <p className="text-sm text-destructive">{copy.error}</p> : null}
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
