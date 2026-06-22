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
        "min-w-0 border border-white/10 bg-race-surface/75 p-4 text-left backdrop-blur",
        "sm:p-5",
        className,
      )}
    >
      <p
        className={cn(
          "font-display text-4xl font-bold leading-none text-white sm:text-5xl",
          accent && "text-race-accent",
        )}
      >
        {value}
      </p>
      <p className="mt-2 text-sm font-medium text-race-muted">{label}</p>
    </div>
  );
}
