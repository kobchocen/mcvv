"use client";

import { PendingSubmitButton } from "@/components/molecules/pending-submit-button";

/**
 * Odesílací tlačítko serverového formuláře s indikací průběhu (spinner + text, zablokované
 * během odesílání), pro dlouhé nevratné akce v administraci (#192, #193). Tenký obal nad
 * `PendingSubmitButton`.
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
  return (
    <PendingSubmitButton
      variant={destructive ? "destructive" : "default"}
      disabled={disabled}
      pendingLabel={pendingLabel}
      className="h-9"
    >
      {label}
    </PendingSubmitButton>
  );
}
