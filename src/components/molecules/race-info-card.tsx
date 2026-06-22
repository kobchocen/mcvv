import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

export type RaceInfoCardProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  className?: string;
};

export function RaceInfoCard({ icon: Icon, title, description, className }: RaceInfoCardProps) {
  return (
    <article
      className={cn(
        "grid gap-4 border border-race-line/55 bg-race-surface p-5 text-left sm:grid-cols-[3rem_1fr]",
        className,
      )}
    >
      <span className="flex size-12 items-center justify-center bg-race-accent/15 text-race-accent">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <h3 className="font-display text-xl font-semibold text-foreground dark:text-white">
          {title}
        </h3>
        <p className="mt-2 text-sm leading-6 text-race-muted">{description}</p>
      </div>
    </article>
  );
}
