import { Star, Trophy } from "lucide-react";

/** Unified pill for records on the runner profile: course record (orange) / personal best (green). */
export function RecordBadge({ kind, label }: { kind: "course" | "personal"; label: string }) {
  const Icon = kind === "course" ? Trophy : Star;
  const tone =
    kind === "course"
      ? "bg-race-accent text-white"
      : "bg-emerald-700 text-white dark:bg-emerald-500 dark:text-emerald-950";
  return (
    <span
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 font-display text-[0.7rem] font-semibold uppercase tracking-wide shadow-sm ${tone}`}
    >
      <Icon className="size-3" aria-hidden="true" />
      {label}
    </span>
  );
}
