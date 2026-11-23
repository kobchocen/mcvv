import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { Link, type Locale } from "@/i18n/routing";
import { canAccess, requireSection } from "@/lib/admin/access";
import type { SectionId } from "@/lib/admin/permissions";
import type { AdminNavHref, AdminNavLabel } from "@/lib/admin/sections";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

const TILES: readonly {
  id: SectionId;
  href: AdminNavHref;
  label: AdminNavLabel;
  hint:
    | "screensStarterHint"
    | "screensSplitsHint"
    | "screensFinishHint"
    | "screensSpeakerHint"
    | "screensResultboardHint";
}[] = [
  {
    id: "screens.starter",
    href: "/start",
    label: "starter",
    hint: "screensStarterHint",
  },
  {
    id: "screens.splits",
    href: "/mezicasy",
    label: "splits",
    hint: "screensSplitsHint",
  },
  {
    id: "screens.finish",
    href: "/cil",
    label: "finishStations",
    hint: "screensFinishHint",
  },
  {
    id: "screens.speaker",
    href: "/mezicasy/speaker",
    label: "speaker",
    hint: "screensSpeakerHint",
  },
  {
    id: "screens.resultboard",
    href: "/resultboard",
    label: "resultboard",
    hint: "screensResultboardHint",
  },
];

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Admin" });
  return { title: t("screensTitle") };
}

export default async function AdminScreensPage({ params }: PageProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  await requireSection("screens", "read");
  const copy = await getTranslations({ locale, namespace: "Admin" });
  const nav = await getTranslations({ locale, namespace: "AdminNav" });

  const cards = [];
  for (const tile of TILES) {
    if (await canAccess(tile.id, "read")) {
      cards.push(tile);
    }
  }

  return (
    <main className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <h1 className="font-display text-3xl font-bold text-foreground dark:text-white">
          {copy("screensTitle")}
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7 text-race-muted">{copy("screensIntro")}</p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2" data-testid="admin-screens">
          {cards.map((card) => (
            <Link
              key={card.href}
              href={card.href}
              className="border border-race-line/55 bg-race-surface p-5 transition-colors hover:border-race-accent/50"
              data-testid={`admin-screens-tile-${card.id}`}
            >
              <p className="font-display text-xl font-semibold text-foreground dark:text-white">
                {nav(card.label)} ↗
              </p>
              <p className="mt-2 text-sm leading-6 text-race-muted">{copy(card.hint)}</p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
