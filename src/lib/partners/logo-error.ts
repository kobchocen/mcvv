/**
 * Srozumitelná hláška k odmítnutému logu partnera (stránky administrace partnerů).
 * Důvod přichází v query `reason` po přesměrování ze `savePartner`.
 */
export const LOGO_REASON_KEYS = {
  empty: "partnersLogoReasonEmpty",
  "too-large": "partnersLogoReasonTooLarge",
  unsupported: "partnersLogoReasonUnsupported",
  "svg-entities": "partnersLogoReasonSvgEntities",
  "svg-external": "partnersLogoReasonSvgExternal",
  "svg-not-svg": "partnersLogoReasonSvgNotSvg",
  "svg-malformed": "partnersLogoReasonSvgMalformed",
  "read-failed": "partnersLogoReasonReadFailed",
} as const;

export type LogoReasonKey = (typeof LOGO_REASON_KEYS)[keyof typeof LOGO_REASON_KEYS];

/** Klíč překladu konkrétního důvodu, nebo null pro neznámý / chybějící důvod. */
export function logoReasonKey(reason: string | undefined): LogoReasonKey | null {
  if (!reason || !Object.hasOwn(LOGO_REASON_KEYS, reason)) return null;
  return LOGO_REASON_KEYS[reason as keyof typeof LOGO_REASON_KEYS];
}

/** Celá hláška: obecná věta + konkrétní důvod (když je znám). */
export function logoErrorMessage(
  logo: string | undefined,
  reason: string | undefined,
  copy: (key: "partnersLogoInvalid" | LogoReasonKey) => string,
): string | undefined {
  if (logo !== "invalid") return undefined;
  const key = logoReasonKey(reason);
  return key ? `${copy("partnersLogoInvalid")} ${copy(key)}` : copy("partnersLogoInvalid");
}
