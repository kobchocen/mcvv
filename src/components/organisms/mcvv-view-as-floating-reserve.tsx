"use client";

import { useLayoutEffect, useState } from "react";

/**
 * Rezervuje místo na konci stránky podle výšky plovoucí lišty náhledu, aby
 * nepřekrývala obsah (třeba pole Ročník na /prihlasky). Na resultboardu se
 * nepřipojuje — tam lišta nesmí posouvat televizní rozvržení.
 */
export function McvvViewAsFloatingReserve() {
  const [height, setHeight] = useState(0);

  useLayoutEffect(() => {
    const el = document.querySelector<HTMLElement>("[data-testid=view-as-floating]");
    if (!el) {
      return;
    }
    const update = () => {
      const bottom = Number.parseFloat(getComputedStyle(el).bottom) || 0;
      setHeight(Math.ceil(el.getBoundingClientRect().height + bottom));
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
      aria-hidden
      data-testid="view-as-floating-space"
      className="pointer-events-none print:hidden h-36"
      style={height > 0 ? { height } : undefined}
    />
  );
}
