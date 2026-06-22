"use client";

import { useMemo } from "react";
import { useLocale, useTranslations } from "next-intl";

import { localeLabels, type Locale, usePathname, useRouter } from "@/i18n/routing";
import { cn } from "@/lib/utils";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type LanguageSwitcherProps = {
  className?: string;
};

export function LanguageSwitcher({ className }: LanguageSwitcherProps) {
  const locale = useLocale() as Locale;
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("LanguageSwitcher");

  const options = useMemo(() => Object.entries(localeLabels) as [Locale, string][], []);

  const handleChange = (nextLocale: string) => {
    router.replace({ pathname }, { locale: nextLocale as Locale });
  };

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-full border border-border/60 bg-card/80 px-2 py-1 shadow-sm",
        className,
      )}
    >
      <span className="pl-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {t("label")}
      </span>
      <Select value={locale} onValueChange={handleChange}>
        <SelectTrigger className="min-w-[130px] rounded-full border-none bg-transparent px-2 py-1 text-sm font-medium text-foreground">
          <SelectValue />
        </SelectTrigger>
        <SelectContent
          align="end"
          className="min-w-[140px] rounded-xl border border-border/60 shadow-xl"
        >
          {options.map(([value, label]) => (
            <SelectItem
              key={value}
              value={value}
              className="rounded-lg py-2 text-sm font-medium text-foreground data-[state=checked]:bg-primary/10"
            >
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
