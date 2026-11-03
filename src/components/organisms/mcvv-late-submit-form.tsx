"use client";

import { useActionState, type ReactNode } from "react";

import { submitLateEntry, type SubmitLateState } from "@/lib/entries/actions";
import { Button } from "@/components/ui/button";

/** Odeslání pozdní přihlášky s povinným souhlasem „Zaplatím ihned“ (mockup dohlaska b). */
export function McvvLateSubmitForm({
  year,
  registrationId,
  copy,
}: {
  year: number;
  registrationId: number;
  copy: {
    payNow: ReactNode;
    submit: string;
    hint: string;
    confirm: string;
    empty: string;
    invalid: string;
  };
}) {
  const [state, action, pending] = useActionState<SubmitLateState, FormData>(submitLateEntry, {});
  return (
    <form action={action} className="mt-4 grid gap-4">
      <input type="hidden" name="year" value={year} />
      <input type="hidden" name="registrationId" value={registrationId} />
      <label className="flex items-start gap-3 text-sm leading-6">
        <input
          type="checkbox"
          name="payNow"
          value="1"
          required
          className="mt-1 size-5 shrink-0 accent-race-accent-solid"
        />
        <span>
          {copy.payNow} <span className="text-destructive">*</span>
        </span>
      </label>
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error === "confirm"
            ? copy.confirm
            : state.error === "empty"
              ? copy.empty
              : copy.invalid}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          disabled={pending}
          className="h-11 bg-race-accent-solid font-display font-semibold text-white hover:bg-race-accent-solid-hover"
        >
          {copy.submit}
        </Button>
        <span className="text-xs text-race-muted">{copy.hint}</span>
      </div>
    </form>
  );
}
