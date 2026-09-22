import { cn } from "@/lib/utils";

const medalFill: Record<1 | 2 | 3, string> = {
  1: "bg-amber-400 text-amber-950",
  2: "bg-zinc-300 text-zinc-800",
  3: "bg-amber-700 text-amber-50",
};

export type RunnerPodiumBadgesProps = {
  absoluteRank?: 1 | 2 | 3;
  categoryRank?: 1 | 2 | 3;
  absoluteLabel: string;
  categoryLabel: string;
};

function Medal({ rank, size, label }: { rank: 1 | 2 | 3; size: "lg" | "sm"; label: string }) {
  return (
    <span
      title={label}
      aria-label={label}
      className={cn(
        "inline-flex items-center justify-center rounded-full font-display font-bold leading-none",
        medalFill[rank],
        size === "lg" ? "size-6 text-xs" : "size-3.5 text-[0.55rem]",
      )}
    >
      {rank}
    </span>
  );
}

export function RunnerPodiumBadges({
  absoluteRank,
  categoryRank,
  absoluteLabel,
  categoryLabel,
}: RunnerPodiumBadgesProps) {
  if (!absoluteRank && !categoryRank) {
    return null;
  }

  return (
    <span className="ml-1.5 inline-flex items-center gap-1 align-middle">
      {absoluteRank ? <Medal rank={absoluteRank} size="lg" label={absoluteLabel} /> : null}
      {categoryRank ? <Medal rank={categoryRank} size="sm" label={categoryLabel} /> : null}
    </span>
  );
}

export function asPodiumRank(rank: number | null | undefined): 1 | 2 | 3 | undefined {
  return rank === 1 || rank === 2 || rank === 3 ? rank : undefined;
}

export function podiumRank(
  entries: { runnerId: string; time: number }[],
  runnerId: string,
): number | null {
  const sorted = [...entries].sort((a, b) => a.time - b.time);
  let rank = 1;
  for (let index = 0; index < sorted.length; index += 1) {
    const row = sorted[index];
    if (index > 0 && row.time !== sorted[index - 1].time) {
      rank = index + 1;
    }
    if (row.runnerId === runnerId) {
      return rank;
    }
  }
  return null;
}
