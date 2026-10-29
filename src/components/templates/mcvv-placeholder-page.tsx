import { McvvPublicNavbar } from "@/components/organisms";
import { Link } from "@/i18n/routing";
import type { McvvHomepageContent } from "@/components/templates/mcvv-homepage-content";

export type McvvPlaceholderPageProps = {
  brand: McvvHomepageContent["brand"];
  nav: McvvHomepageContent["nav"];
  eyebrow: string;
  title: string;
  status: string;
  /** Optional link under the status (e.g. results archive); none by default. */
  link?: { label: string; href: "/results" | "/program" } | null;
  /** Banner above the title (race day: link to the online results, Q116). */
  banner?: {
    title: string;
    text: string;
    label: string;
    href: string;
    /** Emergency override URL outside the site – opens in a new tab. */
    external?: boolean;
  } | null;
};

export function McvvPlaceholderPage({
  brand,
  nav,
  eyebrow,
  title,
  status,
  link = null,
  banner = null,
}: McvvPlaceholderPageProps) {
  const bannerLinkClass =
    "inline-flex h-11 w-fit items-center rounded-md bg-race-accent-solid px-5 font-display text-sm font-semibold uppercase tracking-[0.08em] text-white hover:bg-race-accent-solid-hover";
  return (
    <main className="min-h-screen bg-race-deep text-foreground">
      <McvvPublicNavbar content={{ brand, nav }} variant="solid" />
      <section className="px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="mx-auto grid max-w-3xl gap-6">
          {banner ? (
            <div
              className="grid gap-3 rounded-lg border border-race-accent/60 bg-race-surface p-5"
              data-testid="online-results-banner"
            >
              <p className="flex items-center gap-2 font-display text-lg font-semibold uppercase tracking-[0.06em] text-foreground dark:text-white">
                <span className="size-2.5 animate-pulse rounded-full bg-race-accent" aria-hidden />
                {banner.title}
              </p>
              <p className="text-race-muted">{banner.text}</p>
              {banner.external ? (
                <a href={banner.href} target="_blank" rel="noopener" className={bannerLinkClass}>
                  {banner.label}
                </a>
              ) : (
                <Link href={banner.href as "/vysledky/online"} className={bannerLinkClass}>
                  {banner.label}
                </Link>
              )}
            </div>
          ) : null}
          <div className="flex items-center gap-3">
            <span className="h-0.5 w-7 bg-race-accent" />
            <p className="font-display text-xs font-semibold uppercase tracking-[0.14em] text-race-accent">
              {eyebrow}
            </p>
          </div>
          <h1 className="font-display text-5xl font-bold text-foreground dark:text-white sm:text-6xl">
            {title}
          </h1>
          <p className="text-lg font-semibold text-race-accent">{status}</p>
          {link ? (
            <p>
              <Link
                href={link.href}
                className="font-medium text-race-accent underline-offset-2 hover:underline"
              >
                {link.label}
              </Link>
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
