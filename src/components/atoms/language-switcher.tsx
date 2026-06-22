"use client";

import { Check, ChevronDown, Globe } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import { locales, localeLabels, type Locale, usePathname, useRouter } from "@/i18n/routing";
import { cn } from "@/lib/utils";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export type LanguageSwitcherProps = {
  className?: string;
  compact?: boolean;
  showLabel?: boolean;
};

const localeCodes: Record<Locale, string> = {
  cs: "CZ",
  en: "EN",
};

export function LanguageSwitcher({
  className,
  compact = false,
  showLabel = false,
}: LanguageSwitcherProps) {
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
          size={compact ? "icon" : "default"}
          aria-label={t("label")}
          title={t("label")}
          className={cn(
            compact
              ? "size-[38px] rounded-[10px] border border-white/15 bg-white/8 p-0 text-white shadow-none hover:bg-white/14 hover:text-white"
              : "h-10 rounded-[10px] border border-white/15 bg-white/8 px-3 text-white shadow-none hover:bg-white/14 hover:text-white",
            className,
          )}
        >
          <Globe className="size-[17px]" />
          {!compact && (
            <>
              <span
                className={cn("text-sm font-semibold", showLabel && "font-medium text-white/82")}
              >
                {showLabel ? localeLabels[locale] : localeCodes[locale]}
              </span>
              {!showLabel && <ChevronDown className="size-3.5 text-white/72" aria-hidden="true" />}
            </>
          )}
          <span className="sr-only">{t("label")}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-[184px] rounded-[12px] border-race-line bg-race-deep/95 p-1.5 text-white shadow-2xl shadow-black/35 backdrop-blur"
        sideOffset={10}
      >
        {locales.map((value) => {
          const isSelected = value === locale;

          return (
            <DropdownMenuItem
              key={value}
              onClick={() => handleChange(value)}
              className={cn(
                "flex cursor-pointer items-center gap-2.5 rounded-[8px] px-2.5 py-2.5 text-white outline-none focus:bg-white/10",
                isSelected && "bg-white/10",
              )}
            >
              <span className="flex h-[19px] w-[26px] shrink-0 items-center justify-center rounded-[5px] bg-white/10 text-[10px] font-bold tracking-[0.04em] text-white/86">
                {localeCodes[value]}
              </span>
              <span
                className={cn("min-w-0 flex-1 truncate text-sm", isSelected && "font-semibold")}
              >
                {localeLabels[value]}
              </span>
              {isSelected && <Check className="size-[15px] text-race-accent" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
