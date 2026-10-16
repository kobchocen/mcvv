"use client";

import { useEffect } from "react";

export function HighlightHashedRow() {
  useEffect(() => {
    const highlight = () => {
      const id = decodeURIComponent(window.location.hash.replace(/^#/, ""));
      if (!id) {
        return;
      }
      const row = document.getElementById(id);
      if (!row) {
        return;
      }
      row.classList.add("bg-race-accent/10");
      row.scrollIntoView({ block: "center" });
      // Class name kept as a literal so Tailwind emits the highlight utility.
    };

    highlight();
    window.addEventListener("hashchange", highlight);
    return () => window.removeEventListener("hashchange", highlight);
  }, []);

  return null;
}
