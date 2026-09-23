import { cn } from "@/lib/utils";

export type RaceStatCardProps = {
  value: string;
  label: string;
  accent?: boolean;
  className?: string;
};

export function RaceStatCard({ value, label, accent = false, className }: RaceStatCardProps) {
  return (
    <div
      className={cn(
        "min-w-0 border border-race-line/60 bg-race-surface/90 p-4 text-left backdrop-blur dark:border-white/10 dark:bg-race-surface/75",
        "sm:p-5",
        className,
      )}
    >
      <p
        className={cn(
          "font-display text-4xl font-bold leading-none text-foreground sm:text-5xl dark:text-white",
          accent && "text-race-accent",
        )}
      >
        {value}
      </p>
      <p className="mt-2 text-sm font-medium text-race-muted">{label}</p>
    </div>
  );
}
