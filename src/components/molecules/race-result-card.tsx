import { ArrowUpRight } from "lucide-react";

import { cn } from "@/lib/utils";

export type RaceWinner = {
  category: string;
  name: string;
  time: string;
};

export type RaceResultCardProps = {
  year: string;
  label: string;
  winners: RaceWinner[];
  linkLabel: string;
  className?: string;
};

export function RaceResultCard({
  year,
  label,
  winners,
  linkLabel,
  className,
}: RaceResultCardProps) {
  return (
    <article className={cn("border border-race-line/55 bg-race-surface p-5", className)}>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-display text-4xl font-bold leading-none text-foreground dark:text-white">
            {year}
          </p>
          <p className="mt-2 text-xs font-semibold uppercase text-race-accent">{label}</p>
        </div>
        <span className="bg-race-accent/15 px-3 py-2 text-xs font-semibold text-race-accent">
          {winners.length}
        </span>
      </div>

      <div className="mt-6 grid gap-4">
        {winners.map((winner) => (
          <div
            key={`${year}-${winner.category}`}
            className="flex items-end justify-between gap-4 border-t border-race-line/45 pt-4"
          >
            <div>
              <p className="text-xs font-semibold uppercase text-race-dim">{winner.category}</p>
              <p className="mt-1 text-sm font-semibold text-foreground dark:text-white">
                {winner.name}
              </p>
            </div>
            <p className="font-display text-lg font-semibold text-race-accent">{winner.time}</p>
          </div>
        ))}
      </div>

      <a
        href="#results"
        className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-race-muted transition-colors hover:text-foreground dark:hover:text-white"
      >
        {linkLabel}
        <ArrowUpRight className="size-4" aria-hidden="true" />
      </a>
    </article>
  );
}
