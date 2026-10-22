import { locales, redirect, type Locale } from "@/i18n/routing";
import { adminAccess, type UserRole } from "@/lib/auth/roles";
import { loginTarget } from "@/lib/auth/safe-next";

export { safeAdminNext, safeNext } from "@/lib/auth/safe-next";

export function stripLocalePrefix(pathname: string): string {
  const match = pathname.match(/^\/(cs|en)(?=\/|$|\?)/);
  if (!match || !locales.includes(match[1] as Locale)) {
    return pathname || "/";
  }
  const stripped = pathname.slice(match[0].length);
  return stripped.startsWith("/") || stripped.startsWith("?") ? stripped || "/" : `/${stripped}`;
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
  if (path === "/admin/uzivatele") return "/admin/uzivatele" as const;
  if (path === "/admin/den-zavodu") return "/admin/den-zavodu" as const;
  if (path === "/admin/den-zavodu/prezentace") return "/admin/den-zavodu/prezentace" as const;
  if (path === "/admin/den-zavodu/vysledky") return "/admin/den-zavodu/vysledky" as const;
  if (path === "/admin/den-zavodu/zive") return "/admin/den-zavodu/zive" as const;
  if (path === "/admin/den-zavodu/zive/casy") return "/admin/den-zavodu/zive/casy" as const;
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
  if (path === "/admin/zpravy") return "/admin/zpravy" as const;
  const thread = path.match(/^\/admin\/zpravy\/(\d+)$/);
  if (thread) {
    return { pathname: "/admin/zpravy/[id]" as const, params: { id: thread[1] } };
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

/** Po přihlášení: bezpečný `next`, jinak výchozí cíl podle role (viz `loginTarget`). */
export function redirectAfterLogin(next: string | null, role: UserRole, locale: Locale): never {
  const target = loginTarget(next, adminAccess(role), role);
  if (target.kind === "admin") {
    redirect({ href: adminHref(target.next), locale });
  }
  if (target.kind === "thread") {
    redirect({ href: { pathname: "/zpravy/[id]", params: { id: target.id } }, locale });
  }
  if (target.kind === "user") {
    const query = Object.fromEntries(new URLSearchParams(target.query));
    redirect({
      href: Object.keys(query).length ? { pathname: target.path, query } : target.path,
      locale,
    });
  }
  redirect({ href: "/prihlasky", locale });
  throw new Error("redirect");
}
