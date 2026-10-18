"use client";

import { useActionState } from "react";

import { submitContact, type ContactFormState } from "@/app/[locale]/kontakt/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LIMITS } from "@/lib/contact/limits";

export type ContactFormCopy = {
  name: string;
  email: string;
  message: string;
  submit: string;
  sending: string;
  success: string;
  errorInvalid: string;
  errorSend: string;
  errorExpired: string;
};

const initialState: ContactFormState = { status: "idle" };

export type ContactFormProps = {
  copy: ContactFormCopy;
  /** Podepsaný čas vykreslení (kontrola minimální doby vyplnění). */
  formToken?: string;
  defaults?: { name?: string; email?: string };
};

export function McvvContactForm({ copy, formToken, defaults }: ContactFormProps) {
  const [state, action, pending] = useActionState(submitContact, initialState);

  return (
    <form action={action} className="grid gap-4">
      {formToken ? <input type="hidden" name="ts" value={formToken} /> : null}
      <label className="grid gap-1.5 text-sm font-medium text-foreground dark:text-white">
        {copy.name}
        <Input
          name="name"
          required
          minLength={LIMITS.nameMin}
          maxLength={LIMITS.nameMax}
          defaultValue={defaults?.name}
          autoComplete="name"
          className="h-11 border-race-line bg-race-surface text-foreground"
        />
      </label>
      <label className="grid gap-1.5 text-sm font-medium text-foreground dark:text-white">
        {copy.email}
        <Input
          name="email"
          type="email"
          required
          maxLength={LIMITS.emailMax}
          defaultValue={defaults?.email}
          autoComplete="email"
          className="h-11 border-race-line bg-race-surface text-foreground"
        />
      </label>
      <label className="grid gap-1.5 text-sm font-medium text-foreground dark:text-white">
        {copy.message}
        <Textarea
          name="message"
          required
          minLength={LIMITS.messageMin}
          maxLength={LIMITS.messageMax}
          rows={7}
          className="border-race-line bg-race-surface text-foreground"
        />
      </label>
      <div className="hidden" aria-hidden="true">
        <label>
          Company
          <input type="text" name="company" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      {state.status === "ok" ? (
        <p className="text-sm font-medium text-race-accent">{copy.success}</p>
      ) : null}
      {state.status === "error" ? (
        <p className="text-sm font-medium text-red-400">
          {state.message === "invalid"
            ? copy.errorInvalid
            : state.message === "expired"
              ? copy.errorExpired
              : copy.errorSend}
        </p>
      ) : null}
      <Button
        type="submit"
        disabled={pending}
        className="h-12 w-fit bg-race-accent-solid px-6 font-display font-semibold text-white hover:bg-race-accent-solid-hover"
      >
        {pending ? copy.sending : copy.submit}
      </Button>
    </form>
  );
}
