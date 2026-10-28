import { getTranslations } from "next-intl/server";

import { env } from "@/lib/env";
import { sendMail } from "@/lib/mail/queue";
import { userNotifyRedirected } from "@/lib/messages/notify";
import { getOrganizerEmail } from "@/lib/settings/messages";
import type { Locale } from "@/i18n/routing";

import {
  deliverRoleChangeMail,
  type RoleChange,
  type RoleChangeMailOutcome,
  type RoleChangeMailTranslate,
} from "./role-change-mail";

/**
 * E-mail uživateli o změně role (#191). Jde přes e-mailovou frontu s nízkou prioritou
 * (kind „other“ – nečerpá rezervu, při vyčerpaném denním limitu odejde později).
 * Mimo produkci jde na adresu pořadatele s předmětem „[TEST – pro …]“ jako upozornění ke
 * zprávám. Volá se až po commitu změny role; chyba změnu role neblokuje.
 */
export async function notifyRoleChange(
  change: RoleChange,
  locale: string,
): Promise<RoleChangeMailOutcome> {
  const redirected = userNotifyRedirected();
  const redirectTo = redirected ? await getOrganizerEmail().catch(() => null) : null;
  // Mimo produkci nikdy na skutečnou adresu uživatele.
  if (redirected && !redirectTo) return "skipped";
  return deliverRoleChangeMail(change, locale, {
    site: (env.AUTH_ORIGIN ?? "https://www.mcvv.org").replace(/\/$/, ""),
    redirectTo,
    translator: async (lang) => {
      const t = await getTranslations({
        locale: (lang === "en" ? "en" : "cs") as Locale,
        namespace: "RoleChangeMail",
      });
      return ((key, values) => t(key, values)) satisfies RoleChangeMailTranslate;
    },
    send: (mail) => sendMail({ ...mail, kind: "other" }),
    onError: (error) => console.error("[role-change-mail] send failed", String(error)),
  });
}
