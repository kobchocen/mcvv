import { cn } from "@/lib/utils";

export type SectionEyebrowProps = {
  children: string;
  className?: string;
};

export function SectionEyebrow({ children, className }: SectionEyebrowProps) {
  return (
    <p className={cn("font-display text-sm font-semibold uppercase text-race-accent", className)}>
      {children}
    </p>
  );
}
