"use client";

import { Check, Languages } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { locales, localeLabels, type Locale, usePathname, useRouter } from "@/i18n/routing";
import { cn } from "@/lib/utils";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export type LanguageSwitcherProps = {
  className?: string;
};

export function LanguageSwitcher({ className }: LanguageSwitcherProps) {
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("LanguageSwitcher");

  const handleChange = (nextLocale: Locale) => {
    if (nextLocale === locale) return;
    router.replace({ pathname }, { locale: nextLocale });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("label")}
          title={t("label")}
          className={cn(
            "size-9 rounded-full border border-border/60 bg-background/70 text-foreground shadow-sm hover:bg-accent hover:text-accent-foreground",
            className,
          )}
        >
          <Languages className="size-4" />
          <span className="sr-only">{t("label")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44 rounded-xl" sideOffset={8}>
        <DropdownMenuLabel className="flex items-center gap-2">
          <Languages className="size-4" />
          {t("label")}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {locales.map((value) => {
          const isSelected = value === locale;

          return (
            <DropdownMenuItem
              key={value}
              onClick={() => handleChange(value)}
              className={cn(
                "flex cursor-pointer items-center gap-3 rounded-lg py-2",
                isSelected && "bg-accent text-accent-foreground",
              )}
            >
              <span className="min-w-0 flex-1 truncate font-medium">{localeLabels[value]}</span>
              {isSelected && <Check className="size-4 text-accent-foreground" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
