/**
 * Je odkaz menu aktivní pro danou stránku? Čistá funkce (bez frameworku), aby šla testovat.
 * `pathname` je včetně locale (`/cs/statistiky/rekordy`), `href` bez něj (`/statistiky`).
 * Kotvy na homepage (`#about`) aktivní nejsou nikdy; stránka je aktivní i na podstránkách.
 */
export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") {
    return pathname === "/" || /^\/[a-z]{2}$/.test(pathname);
  }
  if (href.startsWith("#")) {
    return false;
  }
  const path = pathname.replace(/^\/[a-z]{2}(?=\/|$)/, "") || "/";
  return path === href || path.startsWith(`${href}/`);
}
