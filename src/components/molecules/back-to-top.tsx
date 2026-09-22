"use client";

import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

export type BackToTopProps = {
  label: string;
};

export function BackToTop({ label }: BackToTopProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      setVisible(window.scrollY > window.innerHeight * 0.7);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className="fixed right-4 bottom-5 z-30 flex size-11 items-center justify-center bg-race-accent text-white shadow-lg hover:bg-race-accent-hover sm:right-6"
    >
      <ArrowUp className="size-5" aria-hidden="true" />
    </button>
  );
}
