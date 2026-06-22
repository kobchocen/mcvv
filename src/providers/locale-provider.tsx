"use client";

import { useEffect } from "react";

type LocaleProviderProps = {
  locale: string;
  children: React.ReactNode;
};

export function LocaleProvider({ locale, children }: LocaleProviderProps) {
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return <>{children}</>;
}
