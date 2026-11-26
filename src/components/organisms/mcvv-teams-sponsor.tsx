const IONTMAX_HREF = "https://www.iontmax.com/";

export type McvvTeamsSponsorCopy = {
  label: string;
  title: string;
  websiteLabel: string;
};

export type McvvTeamsSponsorProps = {
  copy: McvvTeamsSponsorCopy;
};

/** Sponsor lockup on the team-competition rules page (IONTMAX, official rainbow wordmark). */
export function McvvTeamsSponsor({ copy }: McvvTeamsSponsorProps) {
  return (
    <div
      id="sponzor"
      data-slot="teams-sponsor"
      className="mt-12 flex flex-col gap-6 rounded-lg border border-race-line/50 bg-race-surface p-6 sm:flex-row sm:items-center sm:justify-between sm:gap-8 sm:p-8"
    >
      <div>
        <p className="font-display text-xs font-semibold uppercase tracking-[0.14em] text-race-muted">
          {copy.label}
        </p>
        <p className="mt-2 font-display text-2xl font-semibold leading-tight text-foreground dark:text-white">
          {copy.title}
        </p>
        <p className="mt-2 text-sm text-race-muted">
          {copy.websiteLabel}:{" "}
          <a
            href={IONTMAX_HREF}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-race-accent hover:underline"
          >
            iontmax.com
          </a>
        </p>
      </div>
      <a
        href={IONTMAX_HREF}
        target="_blank"
        rel="noopener noreferrer"
        title="IONTMAX"
        className="inline-flex shrink-0 items-center justify-center self-start sm:self-center"
      >
        {/* Official SVG wordmark + rainbow: black on light, white on dark. Never inline. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/iontmax/iontmax-duha-black.svg"
          alt="IONTMAX"
          width={240}
          height={56}
          className="h-14 w-auto dark:hidden sm:h-16"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/iontmax/iontmax-duha-white.svg"
          alt=""
          width={240}
          height={56}
          className="hidden h-14 w-auto dark:block sm:h-16"
          aria-hidden="true"
        />
      </a>
    </div>
  );
}
