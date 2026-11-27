import { McvvViewAsFloatingBar } from "@/components/organisms/mcvv-admin-view-as";
import { McvvViewAsFloatingReserve } from "@/components/organisms/mcvv-view-as-floating-reserve";
import { getAccess } from "@/lib/admin/access";
import { viewAsBarCopy } from "@/lib/admin/view-as-bar";
import type { Locale } from "@/i18n/routing";

/**
 * Ukončení náhledu očima role i mimo administraci. Náhled role bez rozcestníku (Resultboard,
 * případně role bez sekcí) layout `/admin` přesměruje pryč, kde by admin jinak neměl jak
 * náhled ukončit. Bez aktivního náhledu nic nevykreslí.
 *
 * `reserveSpace` (jen `/prihlasky`) odsune obsah o výšku lišty, aby ji pole formuláře
 * nepřekrývala. Na `/resultboard` se nesmí zapínat — televizní rozvržení se nesmí posunout.
 */
export async function McvvViewAsOutsideAdmin({
  locale,
  reserveSpace = false,
}: Readonly<{ locale: Locale; reserveSpace?: boolean }>) {
  const access = await getAccess();
  const copy = await viewAsBarCopy(access.preview, locale);
  if (!copy) return null;
  return (
    <>
      {reserveSpace ? <McvvViewAsFloatingReserve /> : null}
      <McvvViewAsFloatingBar locale={locale} {...copy} />
    </>
  );
}
