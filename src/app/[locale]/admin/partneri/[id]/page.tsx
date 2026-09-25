import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { McvvAdminHomeLink } from "@/components/organisms";
import { McvvAdminPartnerForm } from "@/components/organisms/mcvv-admin-partner-form";
import { prisma } from "@/lib/db/client";
import { type Locale } from "@/i18n/routing";

type PageProps = Readonly<{
  params: Promise<{ locale: string; id: string }>;
}>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Admin" });
  return { title: t("partnersTitle") };
}

export default async function AdminEditPartnerPage({ params }: PageProps) {
  const { locale: requestedLocale, id: rawId } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  const id = Number.parseInt(rawId, 10);
  if (!Number.isFinite(id)) {
    notFound();
  }
  const row = await prisma.sponsor.findUnique({ where: { id } });
  if (!row) {
    notFound();
  }
  const copy = await getTranslations({ locale, namespace: "Admin" });

  return (
    <main className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <McvvAdminHomeLink label={copy("title")} />
        <h1 className="mb-8 font-display text-3xl font-bold text-foreground dark:text-white">
          {copy("edit")} — {row.name}
        </h1>
        <McvvAdminPartnerForm
          values={{
            id: row.id,
            name: row.name ?? "",
            link: row.link ?? "",
            image: row.image ?? "",
            category: row.category,
            order: row.order,
            active: row.active !== false,
            description: row.description,
          }}
          copy={{
            name: copy("partnersName"),
            link: copy("partnersLink"),
            image: copy("partnersImage"),
            upload: copy("partnersUpload"),
            category: copy("partnersCategory"),
            order: copy("partnersOrder"),
            active: copy("active"),
            description: copy("partnersDescription"),
            save: copy("save"),
          }}
        />
      </div>
    </main>
  );
}

export const dynamic = "force-dynamic";
