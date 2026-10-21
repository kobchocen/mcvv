import { adminAccess, getSession } from "@/lib/auth/session";
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
              staff: adminAccess(session.role) !== "none",
              adminHref: adminHomeHref(session.role),
              messages,
            }
          : null
      }
    />
  );
}
