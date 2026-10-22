/**
 * Hlavičky pro veřejný obrázek banneru. Na rozdíl od log partnerů je
 * Cross-Origin-Resource-Policy `cross-origin`: obrázek načítají webmaily (Seznam, Gmail…)
 * z jiné domény a `same-origin` by ho v prohlížeči zablokovala.
 */
export function bannerResponseHeaders(type: string, length: number): Record<string, string> {
  return {
    "Content-Type": type,
    "Content-Length": String(length),
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Content-Disposition": "inline",
    "Cross-Origin-Resource-Policy": "cross-origin",
  };
}
