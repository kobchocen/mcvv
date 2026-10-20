"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { completeSignup, type SignupState } from "@/lib/auth/signup-actions";
import { Link } from "@/i18n/routing";

export type McvvSignupInviteCopy = {
  email: string;
  name: string;
  clubName: string;
  password: string;
  passwordConfirm: string;
  passwordHint: string;
  submit: string;
  invalid: string;
  used: string;
  signIn: string;
  nameMissing: string;
  short: string;
  mismatch: string;
};

const initial: SignupState = {};

export function McvvSignupInviteForm({
  token,
  email,
  copy,
}: {
  token: string;
  email: string;
  copy: McvvSignupInviteCopy;
}) {
  const [state, action, pending] = useActionState(completeSignup, initial);
  const message =
    state.error === "name"
      ? copy.nameMissing
      : state.error === "short"
        ? copy.short
        : state.error === "mismatch"
          ? copy.mismatch
          : state.error === "invalid"
            ? copy.invalid
            : null;

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="token" value={token} />
      <div className="grid gap-2">
        <Label htmlFor="signup-email">{copy.email}</Label>
        <Input
          id="signup-email"
          type="email"
          value={email}
          readOnly
          autoComplete="username"
          className="h-11 bg-race-surface text-race-muted"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="name">{copy.name}</Label>
        <Input
          id="name"
          name="name"
          required
          maxLength={80}
          autoComplete="name"
          className="h-11 bg-race-surface"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="clubName">{copy.clubName}</Label>
        <Input id="clubName" name="clubName" maxLength={50} className="h-11 bg-race-surface" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">{copy.password}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          aria-describedby="signup-password-hint"
          className="h-11 bg-race-surface"
        />
        <p id="signup-password-hint" className="text-xs text-race-muted">
          {copy.passwordHint}
        </p>
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
      {message ? (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      ) : null}
      {state.error === "used" ? (
        <p role="alert" className="text-sm text-destructive">
          {copy.used}{" "}
          <Link href="/prihlaseni" className="font-semibold text-race-accent hover:underline">
            {copy.signIn}
          </Link>
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
