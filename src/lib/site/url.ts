/** Public canonical origin of the site (sitemap, robots). */
export const DEFAULT_SITE_URL = "https://mcvv.org";

/** SITE_URL from env (http/https origin) or https://mcvv.org; never a trailing slash. */
export function siteUrl(env: Record<string, string | undefined> = process.env): string {
  const raw = env.SITE_URL?.trim();
  if (raw) {
    try {
      const url = new URL(raw);
      if (url.protocol === "https:" || url.protocol === "http:") return url.origin;
    } catch {
      // fall through to default
    }
  }
  return DEFAULT_SITE_URL;
}
