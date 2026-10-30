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

/** SVG elements kept in the output (compared case-insensitively, without namespace prefix). */
const ALLOWED_ELEMENTS = new Set([
  "svg",
  "g",
  "defs",
  "symbol",
  "use",
  "title",
  "desc",
  "path",
  "rect",
  "circle",
  "ellipse",
  "line",
  "polyline",
  "polygon",
  "text",
  "tspan",
  "textpath",
  "lineargradient",
  "radialgradient",
  "stop",
  "clippath",
  "mask",
  "pattern",
  "image",
  "style",
  "marker",
  "filter",
  "fegaussianblur",
  "feoffset",
  "feblend",
  "fecolormatrix",
  "fecomposite",
  "feflood",
  "femerge",
  "femergenode",
  "femorphology",
  "fedropshadow",
]);

/** Elements that are dropped but whose children are kept (e.g. links around shapes). */
const UNWRAP_ELEMENTS = new Set(["a", "switch"]);

/** Elements whose raw text content must never be parsed as markup. */
const RAW_TEXT_ELEMENTS = new Set(["script", "style"]);

/**
 * Harmless editor DOCTYPE (CorelDRAW, Illustrator, Inkscape): `<!DOCTYPE svg>` optionally with a
 * PUBLIC/SYSTEM identifier, but without an internal subset (`[...]`), so no entities can be
 * declared. Such a DOCTYPE is dropped; anything else starting with `<!` is rejected.
 */
const EDITOR_DOCTYPE_RE =
  /^<!DOCTYPE\s+svg(?:\s+PUBLIC\s+(?:"[^"<>[\]]*"|'[^'<>[\]]*')(?:\s+(?:"[^"<>[\]]*"|'[^'<>[\]]*'))?|\s+SYSTEM\s+(?:"[^"<>[\]]*"|'[^'<>[\]]*'))?\s*>/i;

const TAG_RE =
  /^<(\/?)([A-Za-z_][\w:.-]*)((?:\s+[^\s=/>"'<]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'<>=`]+))?)*)\s*(\/?)>/;
const ATTR_RE = /([^\s=/>"'<]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>=`]+)))?/g;

function localName(name: string): string {
  const i = name.indexOf(":");
  return (i >= 0 ? name.slice(i + 1) : name).toLowerCase();
}

/** Remove control characters, whitespace and entity-encoded chars to detect obfuscated schemes. */
function normalizeForSchemeCheck(value: string): string {
  return value
    .replace(/&#x?[0-9a-f]+;?|&[a-z]+;/gi, "")
    .replace(/[\u0000-\u0020\u007f]+/g, "")
    .toLowerCase();
}

const DANGEROUS_VALUE =
  /(?:javascript|vbscript|livescript):|data:(?!image\/(?:png|jpeg|webp|gif);)|expression\(/;

/** Sanitize CSS: repeat until nothing changes so removals cannot recombine into new matches. */
function sanitizeCss(css: string): string | null {
  let prev: string;
  let out = css;
  do {
    prev = out;
    out = out
      .replace(/@import\b[^;]*;?/gi, "")
      .replace(/url\(\s*(['"]?)(?!#)[^)]*\1\s*\)/gi, "none")
      .replace(/expression\s*\(/gi, "")
      .replace(/<\/?[a-z!]/gi, "");
  } while (out !== prev);
  const check = normalizeForSchemeCheck(out);
  if (/@import|url\((?!['"]?#)|javascript:|expression\(|behavior:|-moz-binding/.test(check)) {
    return null;
  }
  return out;
}

function escapeAttr(value: string): string {
  return value.replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeText(value: string): string {
  return value.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Return the serialized allowed attributes, dropping event handlers and unsafe references. */
function sanitizeAttributes(raw: string): string {
  let out = "";
  for (const m of raw.matchAll(ATTR_RE)) {
    const name = m[1];
    const value = m[2] ?? m[3] ?? m[4] ?? "";
    const lname = name.toLowerCase();
    const local = localName(name);
    if (!/^[a-z_][\w:.-]*$/i.test(name)) continue;
    // Event handlers in any namespace (onload, svg:onclick, ...).
    if (local.startsWith("on")) continue;
    if (lname.startsWith("xmlns")) {
      out += ` ${name}="${escapeAttr(value)}"`;
      continue;
    }
    const norm = normalizeForSchemeCheck(value);
    if (local === "href" || local === "src") {
      if (!(value.trim().startsWith("#") || /^data:image\/(?:png|jpeg|webp|gif);/.test(norm)))
        continue;
    } else if (DANGEROUS_VALUE.test(norm)) {
      continue;
    }
    let clean = value;
    if (local === "style" || /url\(/i.test(value)) {
      const css = sanitizeCss(value);
      if (css === null) continue;
      clean = css;
    }
    out += ` ${name}="${escapeAttr(clean)}"`;
  }
  return out;
}

/** Find `</name\s*>` (case-insensitive) from `from` without building a regex from input. */
function findCloseTag(
  src: string,
  from: number,
  name: string,
): { start: number; end: number } | null {
  const lower = src.toLowerCase();
  const needle = `</${name.toLowerCase()}`;
  let pos = lower.indexOf(needle, from);
  while (pos >= 0) {
    let j = pos + needle.length;
    while (j < src.length && /\s/.test(src[j])) j++;
    if (src[j] === ">") return { start: pos, end: j + 1 };
    pos = lower.indexOf(needle, pos + 1);
  }
  return null;
}

/** Why an SVG upload was rejected (shown to the admin as a specific reason). */
export type SvgRejectReason =
  | "svg-entities" // DOCTYPE with an internal subset / ENTITY declarations (XXE, billion laughs)
  | "svg-external" // CSS that cannot be made safe (obfuscated @import/url(), behavior, -moz-binding)
  | "svg-not-svg" // root element is not <svg> or there is content outside of it
  | "svg-malformed"; // cannot be tokenized (unclosed tags, mismatched nesting, ...)

export type SvgAnalysis = { ok: true; svg: string } | { ok: false; reason: SvgRejectReason };

/**
 * Sanitize an SVG document by tokenizing it and rebuilding only allowlisted elements and
 * attributes (no regex removal on the markup itself). Comments, processing instructions,
 * harmless editor DOCTYPEs (without internal subset), metadata, scripts, foreignObject,
 * event handlers and javascript:/external references are dropped. Rejects (with a reason)
 * DOCTYPEs with entities, external CSS, non-SVG roots and markup that cannot be tokenized.
 * Never throws. The result is additionally served with a sandboxing CSP and only rendered
 * via <img>.
 */
export function analyzeSvg(input: string): SvgAnalysis {
  try {
    return analyzeSvgUnsafe(input);
  } catch {
    return { ok: false, reason: "svg-malformed" };
  }
}

/** Sanitized SVG or null (see {@link analyzeSvg} for the reason). */
export function sanitizeSvg(input: string): string | null {
  const result = analyzeSvg(input);
  return result.ok ? result.svg : null;
}

function analyzeSvgUnsafe(input: string): SvgAnalysis {
  const fail = (reason: SvgRejectReason): SvgAnalysis => ({ ok: false, reason });
  const src = input.replace(/^\uFEFF/, "");
  let i = 0;
  let out = "";
  const stack: { name: string; emit: boolean; skipped: boolean }[] = [];
  let skipDepth = 0; // >0 while inside a dropped subtree
  let sawRoot = false;
  let closedRoot = false;
  let sawDoctype = false;

  while (i < src.length) {
    const rest = src.slice(i);
    if (!rest.startsWith("<")) {
      const next = src.indexOf("<", i);
      const text = next < 0 ? rest : src.slice(i, next);
      i += text.length;
      if (closedRoot || !sawRoot) {
        if (text.trim() !== "") return fail("svg-not-svg");
        continue;
      }
      if (skipDepth === 0) out += escapeText(text);
      continue;
    }
    if (rest.startsWith("<!--")) {
      const end = src.indexOf("-->", i + 4);
      if (end < 0) return fail("svg-malformed");
      i = end + 3;
      continue;
    }
    if (rest.startsWith("<![CDATA[")) {
      const end = src.indexOf("]]>", i + 9);
      if (end < 0 || !sawRoot) return fail("svg-malformed");
      if (skipDepth === 0) out += escapeText(src.slice(i + 9, end));
      i = end + 3;
      continue;
    }
    if (rest.startsWith("<?")) {
      const end = src.indexOf("?>", i + 2);
      if (end < 0) return fail("svg-malformed");
      i = end + 2;
      continue;
    }
    if (rest.startsWith("<!")) {
      const doctype = sawRoot || sawDoctype ? null : EDITOR_DOCTYPE_RE.exec(rest);
      if (doctype) {
        sawDoctype = true;
        i += doctype[0].length;
        continue;
      }
      // DOCTYPE with internal subset, ENTITY and other declarations
      return fail(/^<!(?:DOCTYPE|ENTITY)/i.test(rest) ? "svg-entities" : "svg-malformed");
    }
    const m = TAG_RE.exec(rest);
    if (!m) return fail("svg-malformed");
    i += m[0].length;
    const [, closing, name, attrs, selfClosing] = m;
    const local = localName(name);

    if (closing) {
      const top = stack.pop();
      if (!top || top.name.toLowerCase() !== name.toLowerCase()) return fail("svg-malformed");
      if (top.skipped) {
        skipDepth--;
      } else if (top.emit) {
        out += `</${top.name}>`;
      }
      if (stack.length === 0) closedRoot = true;
      continue;
    }

    if (!sawRoot) {
      if (local !== "svg") return fail("svg-not-svg");
      sawRoot = true;
    } else if (closedRoot || stack.length === 0) {
      return fail("svg-not-svg");
    }

    const allowed = skipDepth === 0 && ALLOWED_ELEMENTS.has(local);
    const unwrap = skipDepth === 0 && !allowed && UNWRAP_ELEMENTS.has(local);

    // Raw text elements: consume content up to the matching close tag without parsing it.
    if (!selfClosing && RAW_TEXT_ELEMENTS.has(local)) {
      const close = findCloseTag(src, i, name);
      if (!close) return fail("svg-malformed");
      const content = src.slice(i, close.start);
      i = close.end;
      if (allowed && local === "style") {
        const css = sanitizeCss(content.replace(/<!\[CDATA\[|\]\]>/g, ""));
        if (css === null) return fail("svg-external");
        out += `<${name}${sanitizeAttributes(attrs)}>${escapeText(css)}</${name}>`;
      }
      continue;
    }

    if (allowed) {
      out += `<${name}${sanitizeAttributes(attrs)}${selfClosing ? "/" : ""}>`;
    }
    if (!selfClosing) {
      const skipped = !allowed && !unwrap;
      stack.push({ name, emit: allowed, skipped });
      if (skipped) skipDepth++;
    }
  }

  if (!sawRoot) return fail("svg-not-svg");
  if (!closedRoot || stack.length > 0) return fail("svg-malformed");
  return { ok: true, svg: out.trim() };
}

export type LogoRejectReason = "empty" | "too-large" | "unsupported" | SvgRejectReason;

export type LogoValidation =
  { ok: true; type: LogoType; data: Buffer } | { ok: false; reason: LogoRejectReason };

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
    const svg = analyzeSvg(text);
    if (!svg.ok) {
      return { ok: false, reason: svg.reason };
    }
    // the sanitized document is what gets stored and served
    return { ok: true, type: "image/svg+xml", data: Buffer.from(svg.svg, "utf8") };
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
