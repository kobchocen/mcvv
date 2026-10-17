"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { registerAccount, type RegisterState } from "@/lib/auth/register-actions";
import { Link } from "@/i18n/routing";

export function McvvRegisterForm({
  copy,
}: {
  copy: {
    name: string;
    clubName: string;
    email: string;
    password: string;
    passwordConfirm: string;
    passwordHint?: string;
    passwordConfirmHint?: string;
    mismatch: string;
    submit: string;
    sent: string;
    exists: string;
    mail: string;
    generic: string;
    signIn: string;
  };
}) {
  const [state, action, pending] = useActionState(registerAccount, {} as RegisterState);

  if (state.sent) {
    return <p className="text-base leading-7 text-race-muted">{copy.sent}</p>;
  }

  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="name">{copy.name}</Label>
        <Input
          id="name"
          name="name"
          required
          autoComplete="name"
          className="h-11 bg-race-surface"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="clubName">{copy.clubName}</Label>
        <Input id="clubName" name="clubName" maxLength={50} className="h-11 bg-race-surface" />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="email">{copy.email}</Label>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="h-11 bg-race-surface"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="password">{copy.password}</Label>
        <Input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          aria-describedby={copy.passwordHint ? "password-hint" : undefined}
          className="h-11 bg-race-surface"
        />
        {copy.passwordHint ? (
          <p id="password-hint" className="text-xs text-race-muted">
            {copy.passwordHint}
          </p>
        ) : null}
      </div>
      <div className="grid gap-2">
        <Label htmlFor="passwordConfirm">{copy.passwordConfirm}</Label>
        <Input
          id="passwordConfirm"
          name="passwordConfirm"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          aria-describedby={copy.passwordConfirmHint ? "password-confirm-hint" : undefined}
          className="h-11 bg-race-surface"
        />
        {copy.passwordConfirmHint ? (
          <p id="password-confirm-hint" className="text-xs text-race-muted">
            {copy.passwordConfirmHint}
          </p>
        ) : null}
      </div>
      {state.error === "mismatch" ? (
        <p className="text-sm text-destructive">{copy.mismatch}</p>
      ) : null}
      {state.error === "exists" ? (
        <p className="text-sm text-destructive">
          {copy.exists}{" "}
          <Link href="/prihlaseni" className="font-semibold text-race-accent hover:underline">
            {copy.signIn}
          </Link>
        </p>
      ) : null}
      {state.error === "mail" ? <p className="text-sm text-destructive">{copy.mail}</p> : null}
      {state.error === "generic" ? (
        <p className="text-sm text-destructive">{copy.generic}</p>
      ) : null}
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
