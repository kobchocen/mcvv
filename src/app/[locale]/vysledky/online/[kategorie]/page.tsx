import type { Metadata } from "next";

import {
  McvvOnlineResultsPage,
  onlineResultsMetadata,
} from "@/components/templates/mcvv-online-results-page";

type PageProps = Readonly<{ params: Promise<{ locale: string; kategorie: string }> }>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale, kategorie } = await params;
  return onlineResultsMetadata(locale, kategorie);
}

/** Veřejné online výsledky jedné kategorie (`/vysledky/online/muzi-nad-40-let`). */
export default async function OnlineResultsCategoryPage({ params }: PageProps) {
  const { locale, kategorie } = await params;
  return <McvvOnlineResultsPage locale={locale} slug={kategorie} />;
}

export const dynamic = "force-dynamic";
