"use client";

import type { ReactNode } from "react";
import { useState } from "react";

/** Renders a table that starts with `initial` body rows and reveals the rest on request. */
export function ClubsExpandableTable({
  header,
  rows,
  initial = 15,
  moreLabel,
}: {
  header: ReactNode;
  rows: ReactNode[];
  initial?: number;
  /** Label already including the remaining count, or a plain "Show more". */
  moreLabel: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const hidden = Math.max(0, rows.length - initial);
  const visible = expanded || hidden === 0 ? rows : rows.slice(0, initial);

  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>{header}</thead>
          <tbody>{visible}</tbody>
        </table>
      </div>
      {hidden > 0 && !expanded ? (
        <p className="mt-3">
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="font-display text-sm font-semibold text-race-accent hover:underline"
          >
            {moreLabel}
          </button>
        </p>
      ) : null}
    </div>
  );
}
