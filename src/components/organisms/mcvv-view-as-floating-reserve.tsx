"use client";

import { useLayoutEffect, useState, type ReactNode } from "react";

import { viewAsFloatingSpacePx } from "@/lib/admin/view-as-bar";

/**
 * Když je aktivní náhled, zmenší první viewport o výšku plovoucí lišty, aby
 * nepřekrývala obsah (třeba pole Ročník na /prihlasky). Obsah se posouvá
 * ve zbývajícím prostoru; lišta zůstává `fixed` a nemění se. Na resultboardu
 * se nepřipojuje — tam lišta nesmí posouvat televizní rozvržení.
 */
export function McvvViewAsFloatingReserve({ children }: Readonly<{ children: ReactNode }>) {
  const [space, setSpace] = useState(0);

  useLayoutEffect(() => {
    const el = document.querySelector<HTMLElement>("[data-testid=view-as-floating]");
    if (!el) {
      return;
    }
    const update = () => {
      const bottom = Number.parseFloat(getComputedStyle(el).bottom) || 0;
      setSpace(viewAsFloatingSpacePx(el.getBoundingClientRect().height, bottom));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener("resize", update);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  return (
    <div
      data-testid="view-as-preview-shell"
      className="flex h-dvh flex-col overflow-hidden print:block print:h-auto print:overflow-visible"
    >
      <div
        data-testid="view-as-preview-scroll"
        className="min-h-0 flex-1 overflow-auto overscroll-contain scroll-pb-36 print:overflow-visible"
        style={space > 0 ? { scrollPaddingBottom: space } : undefined}
      >
        {children}
      </div>
      <div
        aria-hidden
        data-testid="view-as-floating-space"
        className="pointer-events-none h-36 shrink-0 bg-race-deep print:hidden"
        style={space > 0 ? { height: space } : undefined}
      />
    </div>
  );
}
