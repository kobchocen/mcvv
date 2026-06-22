import { cn } from "@/lib/utils";

export type RaceBrandProps = {
  top: string;
  bottom: string;
  mark: string;
  className?: string;
};

export function RaceBrand({ top, bottom, mark, className }: RaceBrandProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      <span className="flex size-10 shrink-0 items-center justify-center bg-race-accent font-display text-xl font-bold text-white">
        {mark}
      </span>
      <span className="grid leading-none">
        <span className="font-display text-base font-semibold text-white">{top}</span>
        <span className="font-display text-base font-semibold text-race-accent">{bottom}</span>
      </span>
    </div>
  );
}
