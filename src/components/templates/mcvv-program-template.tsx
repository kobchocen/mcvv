import Link from "next/link";

import {
  ArrowRight,
  Calendar,
  Car,
  ClipboardList,
  Coffee,
  MapPin,
  Route,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { McvvNavbar } from "@/components/organisms";
import { Button } from "@/components/ui/button";
import type { McvvProgramContent, ProgramIcon } from "@/components/templates/mcvv-program-content";
import { cn } from "@/lib/utils";

const programIcons: Record<ProgramIcon, LucideIcon> = {
  calendar: Calendar,
  "map-pin": MapPin,
  route: Route,
  car: Car,
  wallet: Wallet,
  users: Users,
  "clipboard-list": ClipboardList,
  coffee: Coffee,
};

function sectionId(title: string) {
  return title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export type McvvProgramTemplateProps = {
  content: McvvProgramContent;
};

export function McvvProgramTemplate({ content }: McvvProgramTemplateProps) {
  return (
    <main className="min-h-screen overflow-hidden bg-race-deep text-foreground">
      <div className="relative bg-race-forest text-white">
        <McvvNavbar content={content} variant="solid" className="lg:absolute lg:top-0 lg:left-0" />

        <section className="px-4 py-10 sm:px-6 lg:px-8 lg:pt-[140px] lg:pb-[60px]">
          <div className="mx-auto grid max-w-7xl gap-5">
            <div className="flex items-center gap-3">
              <span className="h-0.5 w-7 bg-race-accent" />
              <p className="font-display text-xs font-semibold uppercase tracking-[0.14em] text-race-accent sm:text-sm">
                {content.header.eyebrow}
              </p>
            </div>
            <h1 className="font-display text-5xl font-bold leading-none tracking-normal text-white sm:text-6xl lg:text-[66px]">
              {content.header.title}
            </h1>
            <p className="max-w-2xl text-base leading-7 text-white/84 sm:text-lg sm:leading-8">
              {content.header.lead}
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              {content.header.meta.map((item) => {
                const Icon = programIcons[item.icon];

                return (
                  <span
                    key={item.label}
                    className="inline-flex items-center gap-2 rounded-full border border-race-line bg-race-surface px-4 py-2 text-sm font-medium text-white/84"
                  >
                    <Icon className="size-[15px] text-race-accent" aria-hidden="true" />
                    {item.label}
                  </span>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      <section className="px-4 py-10 sm:px-6 lg:px-8 lg:py-20">
        <div className="mx-auto grid max-w-7xl gap-10 lg:grid-cols-[280px_1fr] lg:gap-14">
          <aside className="hidden lg:block">
            <div className="sticky top-6 rounded-2xl border border-race-line bg-race-surface p-5">
              <p className="font-display text-xs font-semibold uppercase tracking-[0.12em] text-race-muted">
                {content.tocTitle}
              </p>
              <nav className="mt-4 grid gap-1" aria-label={content.tocTitle}>
                {content.sections.map((section, index) => (
                  <Link
                    key={section.title}
                    href={`#${sectionId(section.title)}`}
                    className={cn(
                      "grid grid-cols-[2rem_1fr] items-center rounded-lg px-2.5 py-2 text-sm transition-colors hover:bg-race-accent/10",
                      index === 0 ? "bg-race-accent/10 font-semibold text-white" : "text-white/78",
                    )}
                  >
                    <span className={cn(index === 0 ? "text-race-accent" : "text-race-dim")}>
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span>{section.title}</span>
                  </Link>
                ))}
              </nav>
            </div>
          </aside>

          <div className="grid gap-0">
            {content.sections.map((section) => {
              const Icon = programIcons[section.icon];

              return (
                <article
                  key={section.title}
                  id={sectionId(section.title)}
                  className="grid scroll-mt-8 gap-4 border-b border-race-line py-6 first:pt-0 lg:grid-cols-[220px_1fr] lg:gap-10 lg:py-9"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-[11px] bg-race-accent/10 text-race-accent">
                      <Icon className="size-[21px]" aria-hidden="true" />
                    </span>
                    <h2 className="font-display text-2xl font-semibold leading-tight text-white">
                      {section.title}
                    </h2>
                  </div>
                  <div className="grid gap-3">
                    <p className="text-base font-semibold leading-7 text-white">
                      {section.summary}
                    </p>
                    <p className="max-w-3xl text-sm leading-7 text-race-muted sm:text-base">
                      {section.body}
                    </p>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section id="register" className="px-4 pb-16 sm:px-6 lg:px-8 lg:pb-24">
        <div className="mx-auto max-w-7xl rounded-2xl bg-race-forest px-6 py-10 text-center sm:px-10 lg:py-14">
          <h2 className="font-display text-3xl font-bold leading-tight text-white sm:text-5xl">
            {content.cta.title}
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-race-muted">
            {content.cta.description}
          </p>
          <Button
            asChild
            size="lg"
            className="mt-7 h-12 rounded-[11px] bg-race-accent px-7 text-base font-semibold text-white hover:bg-race-accent-hover"
          >
            <Link href="#register">
              {content.cta.button}
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
