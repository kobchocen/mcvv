import type { Metadata } from "next";
import { setRequestLocale } from "next-intl/server";

import { requireStaff } from "@/lib/admin/staff";
import { audienceHints } from "@/lib/newsletter/hints";
import { McvvAdminHomeLink } from "@/components/organisms";
import { McvvAdminNewsletterForm } from "@/components/organisms/mcvv-admin-newsletter-form";
import { type Locale } from "@/i18n/routing";

type PageProps = Readonly<{ params: Promise<{ locale: string }> }>;

export const metadata: Metadata = { title: "Nová kampaň — Newsletter" };

const TEMPLATE = `Ahoj,

**přihlášky na letošní ročník MCVV jsou otevřené!**

- termín: …
- místo: …

Přihlásit se můžete na [mcvv.org](https://mcvv.org).

Těšíme se na vás,
pořadatelé MCVV`;

export default async function AdminNewsletterNewPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  await requireStaff();
  return (
    <main className="px-4 py-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <McvvAdminHomeLink label="Administrace" />
        <h1 className="mb-8 font-display text-3xl font-bold text-foreground dark:text-white">
          Nová kampaň — Newsletter
        </h1>
        <McvvAdminNewsletterForm
          values={{ subject: "", body: TEMPLATE, audienceUsers: true, audienceYears: 3 }}
          audienceHints={await audienceHints()}
        />
      </div>
    </main>
  );
}

export const dynamic = "force-dynamic";
