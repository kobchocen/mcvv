"use client";

import { useActionState } from "react";

import { submitContact, type ContactFormState } from "@/app/[locale]/kontakt/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export type ContactFormCopy = {
  name: string;
  email: string;
  message: string;
  submit: string;
  sending: string;
  success: string;
  errorInvalid: string;
  errorSend: string;
};

const initialState: ContactFormState = { status: "idle" };

export function McvvContactForm({ copy }: { copy: ContactFormCopy }) {
  const [state, action, pending] = useActionState(submitContact, initialState);

  return (
    <form action={action} className="grid gap-4">
      <label className="grid gap-1.5 text-sm font-medium text-white">
        {copy.name}
        <Input
          name="name"
          required
          minLength={2}
          maxLength={80}
          autoComplete="name"
          className="h-11 border-race-line bg-race-surface text-foreground"
        />
      </label>
      <label className="grid gap-1.5 text-sm font-medium text-white">
        {copy.email}
        <Input
          name="email"
          type="email"
          required
          autoComplete="email"
          className="h-11 border-race-line bg-race-surface text-foreground"
        />
      </label>
      <label className="grid gap-1.5 text-sm font-medium text-white">
        {copy.message}
        <Textarea
          name="message"
          required
          minLength={10}
          maxLength={4000}
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
          {state.message === "invalid" ? copy.errorInvalid : copy.errorSend}
        </p>
      ) : null}
      <Button
        type="submit"
        disabled={pending}
        className="h-12 w-fit bg-race-accent px-6 font-display font-semibold text-white hover:bg-race-accent-hover"
      >
        {pending ? copy.sending : copy.submit}
      </Button>
    </form>
  );
}
