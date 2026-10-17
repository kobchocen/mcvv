/**
 * Validation and sanitization of partner logo uploads (pure, no I/O).
 * Accepted: PNG, JPEG, WebP (detected by magic bytes) and SVG (sanitized).
 */

export const MAX_LOGO_BYTES = 1024 * 1024;

export type LogoType = "image/png" | "image/jpeg" | "image/webp" | "image/svg+xml";

export function detectBitmapType(buffer: Uint8Array): LogoType | null {
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "image/png";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 12 &&
    String.fromCharCode(...buffer.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...buffer.slice(8, 12)) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

const FORBIDDEN_ELEMENTS = [
  "script",
  "foreignObject",
  "iframe",
  "embed",
  "object",
  "audio",
  "video",
  "canvas",
  "handler",
  "listener",
  "set",
  "animate",
  "animateMotion",
  "animateTransform",
];

/**
 * Strip active content from an SVG document and return the cleaned markup, or null when
 * the input is not an SVG or still contains anything suspicious after cleaning.
 * The result is additionally served with a sandboxing CSP and only rendered via <img>.
 */
export function sanitizeSvg(input: string): string | null {
  let svg = input.replace(/^\uFEFF/, "").trim();
  // No DTDs/entities (XXE, billion laughs) and no processing instructions except the XML header.
  if (/<!DOCTYPE|<!ENTITY/i.test(svg)) {
    return null;
  }
  svg = svg
    .replace(/<\?xml[^>]*\?>/i, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .trim();
  if (!/^<svg[\s>]/i.test(svg) || !/<\/svg>\s*$/i.test(svg)) {
    return null;
  }
  for (const tag of FORBIDDEN_ELEMENTS) {
    svg = svg
      .replace(new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}\\s*>`, "gi"), "")
      .replace(new RegExp(`<${tag}\\b[^>]*\\/?>`, "gi"), "");
  }
  // Event handler attributes (onload=, onclick=, ...).
  svg = svg.replace(/\s+on[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  // External or script references: keep only internal fragment refs (#id) and data:image.
  svg = svg.replace(
    /\s+(?:xlink:)?href\s*=\s*("([^"]*)"|'([^']*)')/gi,
    (match, _quoted, dq: string | undefined, sq: string | undefined) => {
      const value = (dq ?? sq ?? "").trim();
      return value.startsWith("#") || /^data:image\/(png|jpeg|webp|gif);/i.test(value) ? match : "";
    },
  );
  // Remove CSS imports and external url() references.
  svg = svg.replace(/@import[^;]*;?/gi, "");
  svg = svg.replace(/url\(\s*(['"]?)(?!#)[^)]*\1\s*\)/gi, "none");

  const suspicious =
    /<\s*(script|foreignObject|iframe|embed|object)\b|\son[a-z]+\s*=|javascript:|vbscript:|data:text\/html|@import/i;
  if (suspicious.test(svg)) {
    return null;
  }
  return svg;
}

export type LogoValidation =
  | { ok: true; type: LogoType; data: Buffer }
  | { ok: false; reason: "empty" | "too-large" | "unsupported" };

export function validateLogo(buffer: Buffer, filename: string): LogoValidation {
  if (buffer.length === 0) {
    return { ok: false, reason: "empty" };
  }
  if (buffer.length > MAX_LOGO_BYTES) {
    return { ok: false, reason: "too-large" };
  }
  const bitmap = detectBitmapType(buffer);
  if (bitmap) {
    return { ok: true, type: bitmap, data: buffer };
  }
  const text = buffer.toString("utf8");
  if (/\.svg$/i.test(filename) || /<svg[\s>]/i.test(text.slice(0, 2048))) {
    const clean = sanitizeSvg(text);
    if (clean) {
      return { ok: true, type: "image/svg+xml", data: Buffer.from(clean, "utf8") };
    }
  }
  return { ok: false, reason: "unsupported" };
}

/** Security headers for serving an uploaded logo. */
export function logoResponseHeaders(type: string, length: number): Record<string, string> {
  return {
    "Content-Type": type,
    "Content-Length": String(length),
    "Cache-Control": "public, max-age=31536000, immutable",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy":
      "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox",
    "Content-Disposition": "inline",
    "Cross-Origin-Resource-Policy": "same-origin",
  };
}
