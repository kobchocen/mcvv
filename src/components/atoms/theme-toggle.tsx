"use client";

import { useEffect, useState } from "react";

import { Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";

import { cn } from "@/lib/utils";
import { useTheme } from "@/providers";

import { Button } from "@/components/ui/button";

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
  const Icon = currentTheme === "dark" ? Moon : Sun;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={t("label")}
      title={t("label")}
      onClick={toggleTheme}
      className={cn(
        "size-10 rounded-[12px] border border-race-line/70 bg-transparent text-foreground shadow-none transition-colors hover:bg-race-forest-2 hover:text-foreground dark:border-white/15 dark:bg-white/8 dark:text-white dark:hover:bg-white/14 dark:hover:text-white",
        className,
      )}
    >
      <Icon className="size-[18px]" />
      <span className="sr-only">{t("label")}</span>
    </Button>
  );
}
