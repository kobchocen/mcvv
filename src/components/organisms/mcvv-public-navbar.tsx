import { getSession } from "@/lib/auth/session";

import { McvvNavbar, type McvvNavbarProps } from "./mcvv-navbar";

export async function McvvPublicNavbar({
  content,
  className,
  variant,
}: Omit<McvvNavbarProps, "account">) {
  const session = await getSession();
  return (
    <McvvNavbar
      content={content}
      className={className}
      variant={variant}
      account={session ? { name: session.name, email: session.email } : null}
    />
  );
}
