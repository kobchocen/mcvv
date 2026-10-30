import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";

import { McvvAdminHomeLink } from "@/components/organisms";
import { McvvAdminPartnerForm } from "@/components/organisms/mcvv-admin-partner-form";
import { type Locale } from "@/i18n/routing";
import { requireStaff } from "@/lib/admin/staff";
import { logoErrorMessage } from "@/lib/partners/logo-error";

type PageProps = Readonly<{
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ logo?: string; reason?: string }>;
}>;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: locale as Locale, namespace: "Admin" });
  return { title: t("partnersTitle") };
}

export default async function AdminNewPartnerPage({ params, searchParams }: PageProps) {
  const { logo: logoStatus, reason: logoReason } = await searchParams;
  const { locale: requestedLocale } = await params;
  const locale = requestedLocale as Locale;
  setRequestLocale(locale);
  await requireStaff();
  const copy = await getTranslations({ locale, namespace: "Admin" });

  return (
    <main className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <McvvAdminHomeLink label={copy("title")} />
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
            general: false,
            description: "",
          }}
          copy={{
            name: copy("partnersName"),
            link: copy("partnersLink"),
            image: copy("partnersImage"),
            upload: copy("partnersUpload"),
            uploadHint: copy("partnersUploadHint"),
            logoError: logoErrorMessage(logoStatus, logoReason, copy),
            category: copy("partnersCategory"),
            order: copy("partnersOrder"),
            active: copy("active"),
            general: copy("partnersGeneral"),
            generalHint: copy("partnersGeneralHint"),
            description: copy("partnersDescription"),
            save: copy("create"),
          }}
        />
      </div>
    </main>
  );
}
