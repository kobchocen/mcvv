import { getSession, isStaffRole } from "@/lib/auth/session";
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
              staff: isStaffRole(session.role),
              messages,
            }
          : null
      }
    />
  );
}
