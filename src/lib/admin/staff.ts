import { getLocale } from "next-intl/server";

import { getSession, isStaffRole } from "@/lib/auth/session";
import { redirect } from "@/i18n/routing";

export async function requireStaff() {
  const session = await getSession();
  if (!session || !isStaffRole(session.role)) {
    const locale = await getLocale();
    redirect({ href: "/prihlaseni", locale });
  }
  return session!;
}

export async function requireAdmin() {
  const session = await requireStaff();
  if (session.role !== "admin") {
    const locale = await getLocale();
    redirect({ href: "/admin", locale });
  }
  return session;
}
