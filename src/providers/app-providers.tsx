"use client";

import type { ReactNode } from "react";
import type { AbstractIntlMessages } from "next-intl";
import { NextIntlClientProvider } from "next-intl";

import type { Locale } from "@/i18n/routing";

import { LocaleProvider } from "./locale-provider";
import { ThemeProvider } from "./theme-provider";

type ProviderComposer = (children: ReactNode) => ReactNode;

function composeProviders(children: ReactNode, composers: ProviderComposer[]) {
  return composers.reduceRight((acc, composer) => composer(acc), children);
}

type AppProvidersProps = {
  children: ReactNode;
  locale: Locale;
  messages: AbstractIntlMessages;
  timeZone: string;
};

/**
 * Central place to manage the order and configuration of global providers.
 * Add new providers to the `composers` array so the layout stays lean.
 */
export function AppProviders({ children, locale, messages, timeZone }: AppProvidersProps) {
  const composers: ProviderComposer[] = [
    (node) => <LocaleProvider locale={locale}>{node}</LocaleProvider>,
    (node) => <ThemeProvider>{node}</ThemeProvider>,
    (node) => (
      <NextIntlClientProvider locale={locale} messages={messages} timeZone={timeZone}>
        {node}
      </NextIntlClientProvider>
    ),
  ];

  return <>{composeProviders(children, composers)}</>;
}
