import type { Metadata } from "next";

import {
  McvvOnlineResultsPage,
  onlineResultsMetadata,
} from "@/components/templates/mcvv-online-results-page";

type PageProps = Readonly<{ params: Promise<{ locale: string }> }>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  return onlineResultsMetadata(locale, null);
}

/** Veřejné online výsledky – naposledy zvolená (jinak první) kategorie. */
export default async function OnlineResultsPage({ params }: PageProps) {
  const { locale } = await params;
  return <McvvOnlineResultsPage locale={locale} slug={null} />;
}

export const dynamic = "force-dynamic";
