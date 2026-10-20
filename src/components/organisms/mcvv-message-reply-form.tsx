"use client";

import { useActionState, useState } from "react";

import type { MessageFormState } from "@/lib/messages/actions";
import { MESSAGE_MAX_LENGTH } from "@/lib/messages/core";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export type McvvMessageReplyCopy = {
  label: string;
  placeholder: string;
  send: string;
  sending: string;
  sent: string;
  /** "{count}/{max}" already resolved by the caller except for the numbers. */
  chars: string;
  errors: Record<string, string>;
};

const initialState: MessageFormState = { status: "idle" };

export function McvvMessageReplyForm({
  action,
  hidden,
  copy,
  idPrefix,
}: {
  action: (state: MessageFormState, formData: FormData) => Promise<MessageFormState>;
  hidden: Record<string, string | number>;
  copy: McvvMessageReplyCopy;
  idPrefix: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  return (
    <ReplyFields
      key={state.stamp ?? 0}
      state={state}
      formAction={formAction}
      pending={pending}
      hidden={hidden}
      copy={copy}
      idPrefix={idPrefix}
    />
  );
}

function ReplyFields({
  state,
  formAction,
  pending,
  hidden,
  copy,
  idPrefix,
}: {
  state: MessageFormState;
  formAction: (formData: FormData) => void;
  pending: boolean;
  hidden: Record<string, string | number>;
  copy: McvvMessageReplyCopy;
  idPrefix: string;
}) {
  const [value, setValue] = useState("");
  const id = `${idPrefix}-body`;
  const errorText =
    state.status === "error" ? (copy.errors[state.error ?? ""] ?? copy.errors.invalid) : "";
  return (
    <form action={formAction} className="grid gap-2">
      {Object.entries(hidden).map(([name, val]) => (
        <input key={name} type="hidden" name={name} value={val} />
      ))}
      <Label htmlFor={id}>{copy.label}</Label>
      <Textarea
        id={id}
        name="body"
        required
        maxLength={MESSAGE_MAX_LENGTH}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder={copy.placeholder}
        className="min-h-28 bg-race-surface"
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          disabled={pending || value.trim().length === 0}
          className="h-10 w-fit bg-race-accent-solid font-display font-semibold text-white hover:bg-race-accent-solid-hover disabled:opacity-50"
        >
          {pending ? copy.sending : copy.send}
        </Button>
        <span className="text-xs text-race-muted">
          {copy.chars
            .replace("{count}", String(value.length))
            .replace("{max}", String(MESSAGE_MAX_LENGTH))}
        </span>
        <span role="status" aria-live="polite" className="text-sm font-medium">
          {state.status === "ok" ? (
            <span className="text-race-accent">{copy.sent} ✓</span>
          ) : errorText ? (
            <span className="text-red-600 dark:text-red-400">{errorText}</span>
          ) : null}
        </span>
      </div>
    </form>
  );
}
