import { cn } from "@/lib/utils";

/**
 * Odznak „spec. start“ (typ) – volitelně se stavem na startovce: splněno (zelená) / porušeno
 * (červená) / bez čísla (šedá). Bez stavu barva typu.
 */
export function McvvAdminSpecialStartBadge({
  label,
  state,
  title,
  className,
}: {
  label: string;
  /** `pending` = ještě bez čísla (neutrální šedá, nic se neporušilo). */
  state?: "ok" | "violated" | "pending";
  title?: string;
  className?: string;
}) {
  return (
    <span
      title={title}
      data-state={state}
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-1.5 text-[0.6875rem] font-semibold",
        state === "ok" &&
          "border-emerald-600/40 bg-emerald-600/10 text-emerald-700 dark:text-emerald-300",
        state === "violated" && "border-red-600/40 bg-red-600/10 text-red-700 dark:text-red-300",
        state === "pending" && "border-race-line text-race-muted",
        !state && "border-race-accent/40 bg-race-accent/10 text-race-accent",
        className,
      )}
    >
      {state === "ok" ? <span aria-hidden="true">✓</span> : null}
      {state === "violated" ? <span aria-hidden="true">✗</span> : null}
      {label}
    </span>
  );
}
