"use client";

import { useEffect, useState } from "react";

import { Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { useTheme } from "@/providers";

import { Button } from "@/components/ui";

export type ThemeToggleProps = {
  className?: string;
};

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { theme, toggleTheme } = useTheme();
  const t = useTranslations("ThemeToggle");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const currentTheme = mounted ? theme : "light";
  const currentLabel = t(currentTheme === "dark" ? "dark" : "light");

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-label={t("label")}
      onClick={toggleTheme}
      className={cn(
        "flex items-center gap-3 rounded-full border-border/60 bg-background/70 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground",
        className,
      )}
    >
      <span className="relative flex size-8 items-center justify-center rounded-full border border-border/60 bg-card transition-colors dark:border-border">
        <Sun className="size-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
        <Moon className="absolute size-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      </span>
      <span className="flex flex-col text-left normal-case tracking-normal">
        <span className="text-[10px] font-semibold uppercase text-muted-foreground">
          {t("label")}
        </span>
        <span className="text-sm font-medium text-foreground">{currentLabel}</span>
      </span>
    </Button>
  );
}
