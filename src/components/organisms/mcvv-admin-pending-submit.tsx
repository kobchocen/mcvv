"use client";

import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/**
 * Odesílací tlačítko serverového formuláře s indikací průběhu (spinner + text, zablokované
 * během odesílání), pro dlouhé nevratné akce v administraci (#192, #193).
 */
export function McvvAdminPendingSubmit({
  label,
  pendingLabel,
  destructive = false,
  disabled = false,
}: {
  label: string;
  pendingLabel: string;
  destructive?: boolean;
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant={destructive ? "destructive" : "default"}
      disabled={pending || disabled}
      aria-busy={pending}
      className="h-9"
    >
      {pending ? <Spinner className="size-4" /> : null}
      {pending ? pendingLabel : label}
    </Button>
  );
}
