import type { ReactNode } from "react";

import { McvvViewAsOutsideAdmin } from "@/components/organisms/mcvv-view-as-outside-admin";
import type { Locale } from "@/i18n/routing";

type LayoutProps = Readonly<{ children: ReactNode; params: Promise<{ locale: string }> }>;

/** Plovoucí pruh „Ukončit náhled“ během náhledu očima role (sem náhled přesměrovává). */
export default async function EntriesLayout({ children, params }: LayoutProps) {
  const { locale } = await params;
  return (
    <McvvViewAsOutsideAdmin locale={locale as Locale} reserveSpace>
      {children}
    </McvvViewAsOutsideAdmin>
  );
}
