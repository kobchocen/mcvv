import { ArrowRight } from "lucide-react";

export type McvvEntriesCtaContentProps = {
  label: string;
  /** Počet přihlášených; 0 nebo chybí = šipka jako dřív. */
  count?: number | null;
};

/** Obsah tlačítka „Přihlášky“: popisek + odznak s počtem přihlášených (nebo šipka). */
export function McvvEntriesCtaContent({ label, count }: McvvEntriesCtaContentProps) {
  return (
    <>
      {label}
      {count && count > 0 ? (
        <span
          data-slot="entries-count"
          className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full bg-white/20 px-1.5 font-sans text-sm leading-none font-semibold whitespace-nowrap text-white tabular-nums ring-1 ring-white/40 ring-inset"
          aria-hidden="true"
        >
          {count}
        </span>
      ) : (
        <ArrowRight className="size-4" aria-hidden="true" />
      )}
    </>
  );
}
