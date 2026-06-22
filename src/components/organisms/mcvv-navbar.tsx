"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import {
  ArrowRight,
  Calendar,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Menu,
  Route,
  X,
  type LucideIcon,
} from "lucide-react";
import { useLocale } from "next-intl";

import { LanguageSwitcher, RaceBrand, ThemeToggle } from "@/components/atoms";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { McvvHomepageContent, NavLink, NavMenuLink } from "@/components/templates";
import { cn } from "@/lib/utils";

const menuIcons: Record<NavMenuLink["icon"], LucideIcon> = {
  "clipboard-list": ClipboardList,
  calendar: Calendar,
  route: Route,
};

export type McvvNavbarProps = {
  content: Pick<McvvHomepageContent, "brand" | "nav">;
  className?: string;
  variant?: "overlay" | "solid";
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

function isActivePath(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/" || /^\/[a-z]{2}$/.test(pathname);
  }

  return pathname.endsWith(href);
}

function DesktopMenuLink({ link, locale }: { link: NavMenuLink; locale: string }) {
  const Icon = menuIcons[link.icon];

  return (
    <DropdownMenuItem asChild className="p-0 focus:bg-transparent">
      <Link
        href={getLocalizedHref(link.href, locale)}
        className="flex w-full items-center gap-3 rounded-[10px] p-2.5 text-left outline-none transition-colors hover:bg-race-accent/10 focus-visible:bg-race-accent/10"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-race-accent/15 text-race-accent">
          <Icon className="size-[18px]" aria-hidden="true" />
        </span>
        <span className="grid min-w-0 gap-0.5">
          <span className="text-sm font-semibold text-white">{link.label}</span>
          <span className="truncate text-xs text-race-muted">{link.description}</span>
        </span>
      </Link>
    </DropdownMenuItem>
  );
}

function MobileLink({ link, locale, active }: { link: NavLink; locale: string; active?: boolean }) {
  return (
    <SheetClose asChild>
      <Link
        href={getLocalizedHref(link.href, locale)}
        className={cn(
          "flex min-h-12 items-center rounded-[10px] px-3.5 text-[17px] font-medium text-white/78 transition-colors hover:bg-white/8 hover:text-white",
          active && "bg-race-accent/10 font-semibold text-white",
        )}
      >
        {link.label}
      </Link>
    </SheetClose>
  );
}

function MobileSubLink({ link, locale }: { link: NavMenuLink; locale: string }) {
  const Icon = menuIcons[link.icon];

  return (
    <SheetClose asChild>
      <Link
        href={getLocalizedHref(link.href, locale)}
        className={cn(
          "flex items-center gap-3 rounded-[9px] px-2.5 py-3 text-white/78 transition-colors hover:bg-white/8 hover:text-white",
          link.href === "/program" && "bg-race-accent/10 text-white",
        )}
      >
        <Icon
          className={cn("size-4 shrink-0", link.href === "/program" ? "text-race-accent" : "")}
          aria-hidden="true"
        />
        <span className="grid min-w-0 gap-0.5">
          <span className="text-sm font-semibold">{link.label}</span>
          <span className="truncate text-xs text-race-muted">{link.description}</span>
        </span>
      </Link>
    </SheetClose>
  );
}

export function McvvNavbar({ content, className, variant = "overlay" }: McvvNavbarProps) {
  const locale = useLocale();
  const pathname = usePathname();

  return (
    <header
      className={cn(
        "z-40 w-full px-4 py-4 text-white sm:px-6 lg:px-8",
        variant === "solid" && "border-b border-race-line bg-race-forest",
        variant === "overlay" && "absolute top-0 left-0",
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

        <nav className="hidden items-center gap-7 lg:flex" aria-label={content.nav.menuLabel}>
          <Link
            href={getLocalizedHref(content.nav.home.href, locale)}
            className={cn(
              "text-sm font-semibold text-white transition-colors hover:text-race-accent",
              isActivePath(pathname, content.nav.home.href) && "text-race-accent",
            )}
          >
            {content.nav.home.label}
          </Link>

          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-1.5 text-sm font-semibold text-white outline-none transition-colors hover:text-race-accent data-[state=open]:text-race-accent">
              {content.nav.raceLabel}
              <ChevronDown className="size-4 text-race-accent" aria-hidden="true" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="start"
              className="w-[290px] rounded-[14px] border-race-line bg-race-deep/95 p-2 text-white shadow-2xl shadow-black/35 backdrop-blur"
              sideOffset={14}
            >
              {content.nav.raceLinks.map((link) => (
                <DesktopMenuLink key={link.href} link={link} locale={locale} />
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {content.nav.links.map((link) => (
            <Link
              key={link.href}
              href={getLocalizedHref(link.href, locale)}
              className={cn(
                "text-sm font-medium text-white/78 transition-colors hover:text-white",
                isActivePath(pathname, link.href) && "font-semibold text-white",
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 lg:flex">
          <LanguageSwitcher />
          <ThemeToggle />
          <Button
            asChild
            className="h-10 rounded-[10px] bg-race-accent px-6 font-display text-[15px] font-semibold uppercase tracking-[0.03em] text-white hover:bg-race-accent-hover"
          >
            <Link href={getLocalizedHref("#register", locale)}>{content.nav.register}</Link>
          </Button>
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
                className="size-[38px] rounded-[10px] border border-white/15 bg-white/8 text-white shadow-none hover:bg-white/14 hover:text-white"
              >
                <Menu className="size-[18px]" aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent
              side="right"
              className="w-[min(100vw,390px)] border-l border-race-line bg-race-deep p-0 text-white sm:max-w-[390px] [&>button.absolute]:hidden"
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
                    className="size-[38px] rounded-[10px] border border-white/15 bg-white/8 text-white shadow-none hover:bg-white/14 hover:text-white"
                  >
                    <X className="size-[18px]" aria-hidden="true" />
                  </Button>
                </SheetClose>
              </SheetHeader>

              <div className="flex min-h-0 flex-1 flex-col gap-5 px-5 pb-5">
                <nav className="grid gap-0.5 pt-3" aria-label={content.nav.menuLabel}>
                  <MobileLink
                    link={content.nav.home}
                    locale={locale}
                    active={isActivePath(pathname, content.nav.home.href)}
                  />
                  <div className="flex min-h-12 items-center justify-between rounded-[10px] px-3.5 text-[17px] font-medium text-white/78">
                    <span>{content.nav.raceLabel}</span>
                    <ChevronUp className="size-[18px] text-race-muted" aria-hidden="true" />
                  </div>
                  <div className="ml-4 grid gap-0.5 border-l-2 border-race-accent py-1 pl-4">
                    {content.nav.raceLinks.map((link) => (
                      <MobileSubLink key={link.href} link={link} locale={locale} />
                    ))}
                  </div>
                  {content.nav.links.map((link) => (
                    <MobileLink key={link.href} link={link} locale={locale} />
                  ))}
                </nav>

                <div className="mt-auto grid gap-3 border-t border-race-line/70 pt-5">
                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <LanguageSwitcher showLabel />
                    <ThemeToggle className="size-11" />
                  </div>
                  <Button
                    asChild
                    className="h-12 rounded-[11px] bg-race-accent px-6 text-base font-semibold text-white hover:bg-race-accent-hover"
                  >
                    <Link href={getLocalizedHref("#register", locale)}>
                      {content.nav.register}
                      <ArrowRight className="size-[17px]" aria-hidden="true" />
                    </Link>
                  </Button>
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
