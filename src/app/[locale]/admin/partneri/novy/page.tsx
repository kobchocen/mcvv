import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { McvvAdminPartnerForm } from "@/components/organisms/mcvv-admin-partner-form";
import { Link } from "@/i18n/routing";
import { type Locale } from "@/i18n/routing";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
}>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Admin" });
  return { title: t("partnersTitle") };
}

export default async function AdminNewPartnerPage({ params }: PageProps) {
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  const copy = await getTranslations({ locale, namespace: "Admin" });

  return (
    <main className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <p className="mb-4">
          <Link
            href="/admin/partneri"
            className="text-sm font-medium text-race-accent hover:underline"
          >
            {copy("back")}
          </Link>
        </p>
        <h1 className="mb-8 font-display text-3xl font-bold text-foreground dark:text-white">
          {copy("new")} — {copy("partnersTitle")}
        </h1>
        <McvvAdminPartnerForm
          values={{
            name: "",
            link: "",
            image: "",
            category: 0,
            order: 0,
            active: true,
            description: "",
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
            save: copy("create"),
          }}
        />
      </div>
    </main>
  );
}
