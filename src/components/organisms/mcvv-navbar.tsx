"use client";

import Link from "next/link";
import { ArrowRight, Menu, Settings, X } from "lucide-react";
import { useLocale } from "next-intl";
import { usePathname } from "next/navigation";

import { LanguageSwitcher, RaceBrand, ThemeToggle } from "@/components/atoms";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { McvvHomepageContent, NavLink } from "@/components/templates";
import { McvvLogoutButton } from "@/components/organisms/mcvv-logout-button";
import { cn } from "@/lib/utils";

export type McvvNavbarAccount = {
  name: string;
  email: string;
  staff?: boolean;
};

export type McvvNavbarProps = {
  content: Pick<McvvHomepageContent, "brand" | "nav">;
  className?: string;
  variant?: "overlay" | "solid";
  account?: McvvNavbarAccount | null;
};

function getLocalizedHref(href: string, locale: string) {
  if (href.startsWith("http") || href.startsWith("mailto:") || href.startsWith("tel:")) {
    return href;
  }

  if (href.startsWith("#")) {
    return `/${locale}${href}`;
  }

  return `/${locale}${href.startsWith("/") ? href : `/${href}`}`;
}

const navIconButtonClass =
  "size-10 rounded-[12px] border border-race-line/70 bg-transparent text-foreground shadow-none hover:bg-race-forest-2 hover:text-foreground dark:border-white/15 dark:bg-white/8 dark:text-white dark:hover:bg-white/14 dark:hover:text-white";

function isActivePath(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/" || /^\/[a-z]{2}$/.test(pathname);
  }

  return pathname.endsWith(href);
}

function MobileLink({ link, locale, active }: { link: NavLink; locale: string; active?: boolean }) {
  return (
    <SheetClose asChild>
      <Link
        href={getLocalizedHref(link.href, locale)}
        className={cn(
          "flex min-h-12 items-center rounded-[10px] px-3.5 text-[17px] font-medium text-foreground/80 transition-colors hover:bg-race-forest-2 hover:text-foreground dark:text-white/78 dark:hover:bg-white/8 dark:hover:text-white",
          active && "bg-race-accent/10 font-semibold text-foreground dark:text-white",
        )}
      >
        {link.label}
      </Link>
    </SheetClose>
  );
}

export function McvvNavbar({ content, className, account }: McvvNavbarProps) {
  const locale = useLocale();
  const pathname = usePathname();

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full border-b border-race-line bg-race-forest px-4 py-4 text-foreground sm:px-6 lg:px-8 dark:text-white",
        className,
      )}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
        <Link
          href={getLocalizedHref(content.nav.home.href, locale)}
          aria-label={content.nav.home.label}
        >
          <RaceBrand {...content.brand} />
        </Link>

        <nav
          className="hidden items-center gap-5 xl:gap-7 lg:flex"
          aria-label={content.nav.menuLabel}
        >
          {content.nav.links.map((link) => (
            <Link
              key={link.href}
              href={getLocalizedHref(link.href, locale)}
              className={cn(
                "text-sm font-medium text-foreground/80 transition-colors hover:text-foreground dark:text-white/78 dark:hover:text-white",
                isActivePath(pathname, link.href) &&
                  "font-semibold text-foreground dark:text-white",
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <LanguageSwitcher />
          <ThemeToggle />
          {account ? (
            <>
              <span
                className="max-w-[10rem] truncate text-sm font-medium text-foreground dark:text-white"
                title={account.email}
              >
                {account.name}
              </span>
              <Button
                asChild
                className="h-10 rounded-[10px] bg-race-accent px-6 font-display text-[15px] font-semibold uppercase tracking-[0.03em] text-white hover:bg-race-accent-hover"
              >
                <Link href={getLocalizedHref("/prihlasky", locale)}>{content.nav.myEntry}</Link>
              </Button>
              {account.staff ? (
                <Button
                  asChild
                  variant="ghost"
                  size="icon"
                  className={navIconButtonClass}
                  aria-label={content.nav.admin}
                  title={content.nav.admin}
                >
                  <Link href={getLocalizedHref("/admin", locale)}>
                    <Settings className="size-[18px]" aria-hidden="true" />
                    <span className="sr-only">{content.nav.admin}</span>
                  </Link>
                </Button>
              ) : null}
              <McvvLogoutButton
                label={content.nav.logout}
                pendingLabel={content.nav.loggingOut}
                className={navIconButtonClass}
              />
            </>
          ) : (
            <Button
              asChild
              className="h-10 rounded-[10px] bg-race-accent px-6 font-display text-[15px] font-semibold uppercase tracking-[0.03em] text-white hover:bg-race-accent-hover"
            >
              <Link href={getLocalizedHref("/prihlaseni", locale)}>{content.nav.register}</Link>
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2 lg:hidden">
          <LanguageSwitcher compact />
          <ThemeToggle />
          <Sheet>
            <SheetTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label={content.nav.menuLabel}
                className="size-[38px] rounded-[10px] border border-race-line/70 bg-transparent text-foreground shadow-none hover:bg-race-forest-2 hover:text-foreground dark:border-white/15 dark:bg-white/8 dark:text-white dark:hover:bg-white/14 dark:hover:text-white"
              >
                <Menu className="size-[18px]" aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="w-[min(100vw,390px)] border-l border-race-line bg-race-deep p-0 text-foreground sm:max-w-[390px] dark:text-white [&>button.absolute]:hidden"
            >
              <SheetHeader className="flex-row items-center justify-between border-b border-race-line/70 px-5 py-5">
                <SheetTitle className="sr-only">{content.nav.menuLabel}</SheetTitle>
                <RaceBrand
                  {...content.brand}
                  className="[&_span:first-child]:size-[34px] [&_span:first-child]:text-[17px] [&_span_span]:text-[13px]"
                />
                <SheetClose asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={content.nav.closeLabel}
                    className="size-[38px] rounded-[10px] border border-race-line/70 bg-transparent text-foreground shadow-none hover:bg-race-forest-2 hover:text-foreground dark:border-white/15 dark:bg-white/8 dark:text-white dark:hover:bg-white/14 dark:hover:text-white"
                  >
                    <X className="size-[18px]" aria-hidden="true" />
                  </Button>
                </SheetClose>
              </SheetHeader>

              <div className="flex min-h-0 flex-1 flex-col gap-5 px-5 pb-5">
                <nav className="grid gap-0.5 pt-3" aria-label={content.nav.menuLabel}>
                  {content.nav.links.map((link) => (
                    <MobileLink
                      key={link.href}
                      link={link}
                      locale={locale}
                      active={isActivePath(pathname, link.href)}
                    />
                  ))}
                </nav>

                <div className="mt-auto grid gap-3 border-t border-race-line/70 pt-5">
                  <div className="flex items-center gap-2">
                    <LanguageSwitcher />
                    <ThemeToggle className="size-11" />
                  </div>
                  {account ? (
                    <>
                      <p
                        className="truncate text-sm font-medium text-foreground dark:text-white"
                        title={account.email}
                      >
                        {account.name}
                      </p>
                      <SheetClose asChild>
                        <Button
                          asChild
                          className="h-12 rounded-[11px] bg-race-accent px-6 text-base font-semibold text-white hover:bg-race-accent-hover"
                        >
                          <Link href={getLocalizedHref("/prihlasky", locale)}>
                            {content.nav.myEntry}
                            <ArrowRight className="size-[17px]" aria-hidden="true" />
                          </Link>
                        </Button>
                      </SheetClose>
                      <div className="flex items-center gap-2">
                        {account.staff ? (
                          <SheetClose asChild>
                            <Button
                              asChild
                              variant="ghost"
                              size="icon"
                              className={cn(navIconButtonClass, "size-11")}
                              aria-label={content.nav.admin}
                              title={content.nav.admin}
                            >
                              <Link href={getLocalizedHref("/admin", locale)}>
                                <Settings className="size-[18px]" aria-hidden="true" />
                                <span className="sr-only">{content.nav.admin}</span>
                              </Link>
                            </Button>
                          </SheetClose>
                        ) : null}
                        <McvvLogoutButton
                          label={content.nav.logout}
                          pendingLabel={content.nav.loggingOut}
                          className={cn(navIconButtonClass, "size-11")}
                        />
                      </div>
                    </>
                  ) : (
                    <SheetClose asChild>
                      <Button
                        asChild
                        className="h-12 rounded-[11px] bg-race-accent px-6 text-base font-semibold text-white hover:bg-race-accent-hover"
                      >
                        <Link href={getLocalizedHref("/prihlaseni", locale)}>
                          {content.nav.register}
                          <ArrowRight className="size-[17px]" aria-hidden="true" />
                        </Link>
                      </Button>
                    </SheetClose>
                  )}
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
