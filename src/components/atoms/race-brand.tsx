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
};

const LOGO_WIDTH = 83;
const LOGO_HEIGHT = 40;

export function RaceBrand({ className, alt = SITE_NAME }: RaceBrandProps) {
  return (
    <span className={cn("inline-flex shrink-0 items-center", className)}>
      {/* Official header mark, 15. 11. 2026 export. Plain <img>: never inlined, no optimizer. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/logo/mcvv-logo-hlavicka-svetla.svg"
        alt={alt}
        width={LOGO_WIDTH}
        height={LOGO_HEIGHT}
        className="h-10 w-auto dark:hidden"
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/images/logo/mcvv-logo-hlavicka-tmava.svg"
        alt=""
        width={LOGO_WIDTH}
        height={LOGO_HEIGHT}
        className="hidden h-10 w-auto dark:block"
        aria-hidden="true"
      />
    </span>
  );
}
