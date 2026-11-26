import { getTranslations } from "next-intl/server";

import type { AccessPreview } from "@/lib/admin/access";
import type { Locale } from "@/i18n/routing";

export type ViewAsBarCopy = { title: string; readOnly: string; stop: string };

/**
 * Texty pruhu „Náhled jako …“ pro aktivní náhled očima role (jen admin s platnou cookie
 * `mcvv_view_as`). Bez náhledu `null` – skutečný účet (třeba Resultboard) pruh nikdy nevidí.
 */
export async function viewAsBarCopy(
  preview: AccessPreview | undefined,
  locale: Locale,
): Promise<ViewAsBarCopy | null> {
  if (!preview) return null;
  const usersCopy = await getTranslations({ locale, namespace: "AdminUsers" });
  const viewCopy = await getTranslations({ locale, namespace: "AdminViewAs" });
  const prefix = preview.mode === "v2" ? "staffRole" : "role";
  const labels = preview.roles.map((role) =>
    usersCopy.has(`${prefix}_${role}`) ? usersCopy(`${prefix}_${role}` as "role_admin") : role,
  );
  return {
    title: viewCopy("barTitle", { roles: labels.join(", ") }),
    readOnly: viewCopy("barReadOnly"),
    stop: viewCopy("stop"),
  };
}
