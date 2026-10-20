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
};

export function McvvPlaceholderPage({
  brand,
  nav,
  eyebrow,
  title,
  status,
  link = null,
}: McvvPlaceholderPageProps) {
  return (
    <main className="min-h-screen bg-race-deep text-foreground">
      <McvvPublicNavbar content={{ brand, nav }} variant="solid" />
      <section className="px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
        <div className="mx-auto grid max-w-3xl gap-6">
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
