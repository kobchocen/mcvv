import { getTranslations } from "next-intl/server";

import { canOpenAdmin, getAccess } from "@/lib/admin/access";
import { getSession } from "@/lib/auth/session";
import { adminHomeHref } from "@/lib/auth/roles";
import { getUnreadCount } from "@/lib/messages/store";

import { McvvNavbar, type McvvNavbarProps } from "./mcvv-navbar";

export async function McvvPublicNavbar({
  content,
  className,
  variant,
}: Omit<McvvNavbarProps, "account">) {
  const session = await getSession();
  // Anonymní návštěvník: žádný dotaz do DB (getUnreadCount vrací null bez sessionu).
  const messages = session ? await getUnreadCount() : null;
  const starter =
    session?.role === "starter"
      ? { href: "/start" as const, label: (await getTranslations("Starter"))("navLink") }
      : session?.role === "prestarter"
        ? {
            href: "/predstarter" as const,
            label: (await getTranslations("Prestarter"))("navLink"),
          }
        : null;
  return (
    <McvvNavbar
      content={content}
      className={className}
      variant={variant}
      account={
        session
          ? {
              name: session.name,
              email: session.email,
              // Stejné rozhodnutí jako layout /admin (DB role, při permissions.v2 engine).
              staff: canOpenAdmin(await getAccess()),
              adminHref: adminHomeHref(),
              starter,
              messages,
            }
          : null
      }
    />
  );
}
