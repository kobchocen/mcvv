import { locales, redirect, type Locale } from "@/i18n/routing";

const ADMIN_PATH = /^\/admin(?:\/[\w.-]+)*$/;
const ADMIN_QUERY = /^[\w.=&-]*$/;

export function stripLocalePrefix(pathname: string): string {
  const match = pathname.match(/^\/(cs|en)(?=\/|$|\?)/);
  if (!match || !locales.includes(match[1] as Locale)) {
    return pathname || "/";
  }
  const stripped = pathname.slice(match[0].length);
  return stripped.startsWith("/") || stripped.startsWith("?") ? stripped || "/" : `/${stripped}`;
}

export function safeAdminNext(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 180) {
    return null;
  }
  let value = raw.trim();
  try {
    value = decodeURIComponent(value);
  } catch {
    return null;
  }
  value = stripLocalePrefix(value);
  const qIndex = value.indexOf("?");
  const path = (qIndex >= 0 ? value.slice(0, qIndex) : value).replace(/\/$/, "") || "/";
  const query = qIndex >= 0 ? value.slice(qIndex + 1) : "";
  if (path.includes("\\") || path.includes("//") || path.includes("://")) {
    return null;
  }
  if (!ADMIN_PATH.test(path)) {
    return null;
  }
  if (query && !ADMIN_QUERY.test(query)) {
    return null;
  }
  return query ? `${path}?${query}` : path;
}

export function loginHref(next: string | null) {
  if (!next) {
    return "/prihlaseni" as const;
  }
  return { pathname: "/prihlaseni" as const, query: { next } };
}

function adminHref(next: string) {
  const url = new URL(next, "http://mcvv.local");
  const path = url.pathname.replace(/\/$/, "") || "/";
  const rokQuery = url.searchParams.get("rok");
  const query = rokQuery ? { rok: rokQuery } : undefined;

  if (path === "/admin") return "/admin" as const;
  if (path === "/admin/nastaveni") return "/admin/nastaveni" as const;
  if (path === "/admin/partneri") return "/admin/partneri" as const;
  if (path === "/admin/partneri/novy") return "/admin/partneri/novy" as const;
  const partner = path.match(/^\/admin\/partneri\/(\d+)$/);
  if (partner) {
    return { pathname: "/admin/partneri/[id]" as const, params: { id: partner[1] } };
  }
  if (path === "/admin/rocniky") return "/admin/rocniky" as const;
  if (path === "/admin/rocniky/novy") return "/admin/rocniky/novy" as const;
  const edition = path.match(/^\/admin\/rocniky\/(\d+)$/);
  if (edition) {
    return { pathname: "/admin/rocniky/[id]" as const, params: { id: edition[1] } };
  }
  if (path === "/admin/ciselniky") return "/admin/ciselniky" as const;
  if (path === "/admin/ciselniky/kategorie") return "/admin/ciselniky/kategorie" as const;
  if (path === "/admin/ciselniky/kluby") {
    return query
      ? { pathname: "/admin/ciselniky/kluby" as const, query }
      : ("/admin/ciselniky/kluby" as const);
  }
  if (path === "/admin/prihlasky") {
    return query ? { pathname: "/admin/prihlasky" as const, query } : ("/admin/prihlasky" as const);
  }
  const registration = path.match(/^\/admin\/prihlasky\/(\d+)\/(\d+)$/);
  if (registration) {
    return {
      pathname: "/admin/prihlasky/[rok]/[id]" as const,
      params: { rok: registration[1], id: registration[2] },
    };
  }
  return "/admin" as const;
}

export function redirectAfterLogin(next: string | null, staff: boolean, locale: Locale): never {
  if (staff && next) {
    redirect({ href: adminHref(next), locale });
  }
  redirect({ href: "/", locale });
  throw new Error("redirect");
}
