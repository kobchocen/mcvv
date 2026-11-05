"use client";

import { useEffect } from "react";

/**
 * Keeps `<html lang>` in sync with the active web locale (#273). The root layout sits outside
 * `[locale]` and renders a static `lang`, so screen readers and hyphenation would otherwise
 * treat German, Polish and Ukrainian pages as English.
 */
export function HtmlLang({ locale }: { locale: string }) {
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return null;
}
