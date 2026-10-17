"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { resetPassword, type ResetState } from "@/lib/auth/reset-actions";

export type McvvResetPasswordCopy = {
  password: string;
  passwordConfirm: string;
  submit: string;
  invalid: string;
  short: string;
  mismatch: string;
};

const initial: ResetState = {};

export function McvvResetPasswordForm({
  token,
  copy,
}: {
  token: string;
  copy: McvvResetPasswordCopy;
}) {
  const [state, action, pending] = useActionState(resetPassword, initial);

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="token" value={token} />
      <div className="grid gap-2">
        <Label htmlFor="password">{copy.password}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          className="h-11 bg-race-surface"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="passwordConfirm">{copy.passwordConfirm}</Label>
        <Input
          id="passwordConfirm"
          name="passwordConfirm"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          className="h-11 bg-race-surface"
        />
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {copy[state.error]}
        </p>
      ) : null}
      <Button
        type="submit"
        disabled={pending}
        className="h-11 bg-race-accent-solid font-display font-semibold text-white hover:bg-race-accent-solid-hover"
      >
        {copy.submit}
      </Button>
    </form>
  );
}
