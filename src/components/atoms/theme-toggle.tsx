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
        "size-9 rounded-full border border-border/60 bg-background/70 text-foreground shadow-sm transition-none hover:bg-accent hover:text-accent-foreground",
        className,
      )}
    >
      <Icon className="size-4" />
      <span className="sr-only">{t("label")}</span>
    </Button>
  );
}
