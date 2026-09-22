"use client";

import { useState } from "react";

export type RunnerPortraitProps = {
  id: string;
  name: string;
};

export function RunnerPortrait({ id, name }: RunnerPortraitProps) {
  const [hidden, setHidden] = useState(false);
  if (hidden) {
    return null;
  }

  return (
    // Native img: blob is served by /api/bezec-foto, never loaded in RSC.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/bezec-foto?id=${encodeURIComponent(id)}`}
      alt={name}
      width={180}
      height={180}
      onError={() => setHidden(true)}
      className="h-[180px] w-[180px] shrink-0 border border-race-line/55 bg-race-forest object-cover"
    />
  );
}
