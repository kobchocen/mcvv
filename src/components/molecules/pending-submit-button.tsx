"use client";

import { useEffect, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

export type PendingSubmitButtonProps = Omit<ComponentProps<typeof Button>, "type"> & {
  /** Text během akce (výchozí „Pracuji…“). */
  pendingLabel?: ReactNode;
};

/**
 * Odesílací tlačítko serverového formuláře s indikací průběhu (#192, Q248), vzhledem shodné
 * s `ConfirmSubmitButton`. Během akce formuláře jsou zablokovaná VŠECHNA tlačítka formuláře
 * (sdílený `useFormStatus`), spinner a „Pracuji…“ ukazuje jen tlačítko, které formulář
 * odeslalo (submitter) – i když má formulář víc akcí přes `formAction`.
 */
export function PendingSubmitButton({
  pendingLabel,
  disabled,
  children,
  ...buttonProps
}: PendingSubmitButtonProps) {
  const t = useTranslations("ConfirmDialog");
  const { pending } = useFormStatus();
  const ref = useRef<HTMLButtonElement>(null);
  const [submitter, setSubmitter] = useState(false);

  useEffect(() => {
    const form = ref.current?.form;
    if (!form) return;
    const onSubmit = (event: SubmitEvent) => setSubmitter(event.submitter === ref.current);
    form.addEventListener("submit", onSubmit);
    return () => form.removeEventListener("submit", onSubmit);
  }, []);

  const busy = pending && submitter;
  return (
    <Button
      {...buttonProps}
      ref={ref}
      type="submit"
      disabled={disabled || pending}
      aria-busy={busy || undefined}
    >
      {busy ? <Spinner className="size-4" aria-hidden /> : null}
      {busy ? (pendingLabel ?? t("working")) : children}
    </Button>
  );
}
