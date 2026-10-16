"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

import { useRouter } from "@/i18n/routing";

export function McvvLoginNextRedirect() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const stripped = pathname.replace(/^\/(cs|en)(?=\/|$)/, "") || "/";
    const rest = stripped.startsWith("/") ? stripped : `/${stripped}`;
    const search = searchParams.toString();
    const next = `${rest}${search ? `?${search}` : ""}`;
    router.replace({ pathname: "/prihlaseni", query: { next } });
  }, [pathname, router, searchParams]);

  return null;
}
