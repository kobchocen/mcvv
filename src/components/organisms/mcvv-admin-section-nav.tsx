"use client";

import { useEffect, useRef, useState } from "react";

import {
  activeSection,
  hashSection,
  SECTION_NAV_OFFSET,
  type SectionNavItem,
} from "@/lib/admin/section-nav-core";
import { cn } from "@/lib/utils";

type Props = Readonly<{
  items: readonly SectionNavItem[];
  title: string;
  variant: "chips" | "aside";
}>;

function useActiveSection(items: readonly SectionNavItem[]): string | null {
  const [active, setActive] = useState<string | null>(items[0]?.id ?? null);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const positions = items.flatMap((item) => {
        const element = document.getElementById(item.id);
        return element ? [{ id: item.id, top: element.getBoundingClientRect().top }] : [];
      });
      const atBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      setActive(activeSection(positions, SECTION_NAV_OFFSET, atBottom));
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    // První výpočet až v dalším snímku: kotva z URL (#id) má přednost před pozicí scrollu.
    const initial = window.requestAnimationFrame(() => {
      const fromHash = hashSection(window.location.hash, items);
      if (fromHash) setActive(fromHash);
      else update();
    });
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.cancelAnimationFrame(initial);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [items]);
  return active;
}

/**
 * Navigátor „Na této stránce“ (P10): na desktopu sticky seznam vpravo, na mobilu sticky lišta
 * s čipy. Odkazy jsou obyčejné kotvy (#id), takže jdou sdílet a fungují i bez JS.
 */
export function McvvAdminSectionNav({ items, title, variant }: Props) {
  const active = useActiveSection(items);
  const chipsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (variant !== "chips" || !active) return;
    const chip = chipsRef.current?.querySelector<HTMLElement>(`[data-section="${active}"]`);
    chip?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active, variant]);

  if (variant === "chips") {
    return (
      <nav
        aria-label={title}
        data-testid="section-nav-chips"
        className="sticky top-0 z-20 -mx-4 mb-6 border-b border-race-line/45 bg-race-deep/95 px-4 py-2 backdrop-blur xl:hidden print:hidden"
      >
        <div ref={chipsRef} className="flex gap-2 overflow-x-auto">
          {items.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              data-section={item.id}
              aria-current={active === item.id ? "location" : undefined}
              className={cn(
                "shrink-0 whitespace-nowrap rounded-full border px-3 py-1.5 text-sm",
                active === item.id
                  ? "border-race-accent bg-race-accent/15 font-semibold text-race-accent"
                  : "border-race-line/60 text-foreground/80",
              )}
            >
              {item.label}
            </a>
          ))}
        </div>
      </nav>
    );
  }

  return (
    <nav aria-label={title} data-testid="section-nav" className="sticky top-6 print:hidden">
      <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-[0.08em] text-race-muted">
        {title}
      </p>
      <ul className="border-l border-race-line/55">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              aria-current={active === item.id ? "location" : undefined}
              className={cn(
                "-ml-px block border-l-2 px-3 py-1.5 text-sm",
                active === item.id
                  ? "border-race-accent font-semibold text-race-accent"
                  : "border-transparent text-foreground/75 hover:text-foreground",
              )}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
