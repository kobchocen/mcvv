export type ShareOutcome = "shared" | "copied" | "cancelled" | "failed";

/** The parts of `window` / `navigator` used for sharing (injectable for tests). */
export type ShareEnvironment = {
  share?: (data: ShareData) => Promise<void>;
  canShare?: (data: ShareData) => boolean;
  writeText?: (text: string) => Promise<void>;
  /** Touch-first device (phone, tablet): prefer the native share sheet. */
  coarsePointer: boolean;
};

export function shareEnvironment(): ShareEnvironment {
  const nav = typeof navigator === "undefined" ? undefined : navigator;
  return {
    share: nav?.share ? (data) => nav.share(data) : undefined,
    canShare: nav?.canShare ? (data) => nav.canShare(data) : undefined,
    writeText: nav?.clipboard?.writeText ? (text) => nav.clipboard.writeText(text) : undefined,
    coarsePointer:
      typeof window !== "undefined" && typeof window.matchMedia === "function"
        ? window.matchMedia("(pointer: coarse)").matches
        : false,
  };
}

function isAbort(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

/**
 * Mobile: native share sheet (Web Share API) with the permalink. Desktop, or when the
 * share sheet is unavailable or fails: copy the permalink to the clipboard.
 * Closing the share sheet is "cancelled" (no clipboard fallback, no toast).
 */
export async function sharePhotoLink(
  data: { url: string; title: string },
  env: ShareEnvironment,
): Promise<ShareOutcome> {
  const payload: ShareData = { url: data.url, title: data.title };
  if (env.coarsePointer && env.share && (env.canShare?.(payload) ?? true)) {
    try {
      await env.share(payload);
      return "shared";
    } catch (error) {
      if (isAbort(error)) return "cancelled";
    }
  }
  if (!env.writeText) return "failed";
  try {
    await env.writeText(data.url);
    return "copied";
  } catch {
    return "failed";
  }
}
