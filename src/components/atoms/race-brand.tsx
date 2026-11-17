import { SITE_NAME } from "@/lib/site/seo";
import { cn } from "@/lib/utils";

export type RaceBrandProps = {
  top: string;
  bottom: string;
  mark: string;
  className?: string;
  /**
   * Accessible name of the mark. Pass an empty string when a parent link already
   * has an aria-label, so the logo is not announced twice.
   */
  alt?: string;
  /** Compact lockup for the mobile menu sheet. */
  size?: "default" | "compact";
};

/** Official wordmark from the brand manual (page 13 WEB). Always Czech, even on localized pages. */
export const RACE_WORDMARK_TOP = "MALÁ CENA";
export const RACE_WORDMARK_BOTTOM = "VELKÉ VERANDY";

// viewBox ≈ 214.07 × 102.52; 52 px tall ≈ 108 px wide.
const LOGO_WIDTH = 108;
const LOGO_HEIGHT = 52;

export function RaceBrand({ className, alt = SITE_NAME, size = "default" }: RaceBrandProps) {
  const compact = size === "compact";

  return (
    <span
      className={cn(
        "inline-flex min-w-0 items-center",
        compact ? "gap-2" : "gap-2 sm:gap-2.5 xl:gap-3",
        className,
      )}
    >
      {/* Official header mark, 15. 11. 2026 export. Plain <img>: never inlined, no optimizer. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/logo/mcvv-logo-hlavicka-svetla.svg"
        alt={alt}
        width={LOGO_WIDTH}
        height={LOGO_HEIGHT}
        className={cn("w-auto shrink-0 dark:hidden", compact ? "h-9" : "h-10 sm:h-12 xl:h-[52px]")}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/logo/mcvv-logo-hlavicka-tmava.svg"
        alt=""
        width={LOGO_WIDTH}
        height={LOGO_HEIGHT}
        className={cn(
          "hidden w-auto shrink-0 dark:block",
          compact ? "h-9" : "h-10 sm:h-12 xl:h-[52px]",
        )}
        aria-hidden="true"
      />
      <span
        className={cn(
          "grid min-w-0 gap-0.5 whitespace-nowrap leading-none",
          compact ? "text-[12px]" : "text-[12.5px] sm:text-[15px] xl:text-base",
        )}
        aria-hidden="true"
      >
        <span className="font-display font-semibold uppercase tracking-[0.02em] text-foreground dark:text-white">
          {RACE_WORDMARK_TOP}
        </span>
        <span className="font-display font-semibold uppercase tracking-[0.02em] text-race-accent">
          {RACE_WORDMARK_BOTTOM}
        </span>
      </span>
    </span>
  );
}
