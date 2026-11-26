import { McvvViewAsFloatingBar } from "@/components/organisms/mcvv-admin-view-as";
import { getAccess } from "@/lib/admin/access";
import { viewAsBarCopy } from "@/lib/admin/view-as-bar";
import type { Locale } from "@/i18n/routing";

/**
 * Ukončení náhledu očima role i mimo administraci. Náhled role bez rozcestníku (Resultboard,
 * případně role bez sekcí) layout `/admin` přesměruje pryč, kde by admin jinak neměl jak
 * náhled ukončit. Bez aktivního náhledu nic nevykreslí.
 */
export async function McvvViewAsOutsideAdmin({ locale }: Readonly<{ locale: Locale }>) {
  const access = await getAccess();
  const copy = await viewAsBarCopy(access.preview, locale);
  return copy ? <McvvViewAsFloatingBar locale={locale} {...copy} /> : null;
}
