import type { ReactNode } from "react";

import { SectionEyebrow } from "@/components/atoms";
import { cn } from "@/lib/utils";

export type SectionHeaderProps = {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
  align?: "start" | "center";
  titleClassName?: string;
  className?: string;
};

export function SectionHeader({
  eyebrow,
  title,
  description,
  action,
  align = "start",
  titleClassName,
  className,
}: SectionHeaderProps) {
  const centered = align === "center";

  return (
    <div
      className={cn(
        "flex flex-col gap-6",
        centered ? "items-center text-center" : "items-start",
        action && !centered && "sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className={cn(centered && "mx-auto")}>
        <SectionEyebrow>{eyebrow}</SectionEyebrow>
        <h2
          className={cn(
            "mt-4 font-display text-4xl font-bold leading-tight text-foreground dark:text-white sm:text-5xl",
            titleClassName,
          )}
        >
          {title}
        </h2>
      </div>
      {description ? (
        <p className={cn("text-sm leading-6 text-race-muted", centered && "mx-auto")}>
          {description}
        </p>
      ) : null}
      {action}
    </div>
  );
}
