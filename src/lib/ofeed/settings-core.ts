/** Nastavení OFeed (#122) v `mcvv_setting`; heslo je zašifrované (secret-box). */
export const OFEED_KEYS = {
  enabled: "ofeed_enabled",
  eventId: "ofeed_event_id",
  password: "ofeed_password_enc",
  passwordSetAt: "ofeed_password_set_at",
} as const;

export const OFEED_SECRET_PURPOSE = "ofeed-password";
/** Heslo akce v OFeed platí 7 dní od vygenerování (docs „Vytvoření akce“). */
export const OFEED_PASSWORD_VALID_DAYS = 7;
export const OFEED_PUBLIC_ORIGIN = "https://orienteerfeed.com";
export const OFEED_BOARD_URL = "https://board.orienteerfeed.com";

export type OfeedSettings = {
  enabled: boolean;
  eventId: string | null;
  /** Jen informace, jestli je heslo uložené – hodnota se z DB ven nedostane. */
  hasPassword: boolean;
  passwordSetAt: Date | null;
};

/** ID akce v OFeed (cuid, např. `cmg4t3f0i0007my3m5hh50wl2`). */
export function parseEventId(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  return /^[A-Za-z0-9_-]{5,64}$/.test(value) ? value : null;
}

export function parsePassword(raw: string | null | undefined): string | null {
  const value = (raw ?? "").trim();
  return value.length >= 4 && value.length <= 200 && !/[\r\n]/.test(value) ? value : null;
}

export function passwordExpiresAt(setAt: Date | null): Date | null {
  return setAt ? new Date(setAt.getTime() + OFEED_PASSWORD_VALID_DAYS * 86_400_000) : null;
}

/** Veřejná stránka akce v OFeed se záložkou výsledků. */
export function ofeedPublicUrl(eventId: string): string {
  return `${OFEED_PUBLIC_ORIGIN}/events/${encodeURIComponent(eventId)}?tab=results`;
}

/** Odkaz „Online výsledky“: ručně zadaná URL má přednost, jinak akce v OFeed. */
export function resolveOnlineResultsUrl(
  manualUrl: string | null,
  ofeedEventId: string | null,
): string | null {
  if (manualUrl) return manualUrl;
  return ofeedEventId ? ofeedPublicUrl(ofeedEventId) : null;
}

export function settingsFromRows(rows: { key: string; text: string }[]): OfeedSettings {
  const map = new Map(rows.map((row) => [row.key, row.text]));
  const setAtRaw = map.get(OFEED_KEYS.passwordSetAt);
  const setAt = setAtRaw ? new Date(setAtRaw) : null;
  return {
    enabled: map.get(OFEED_KEYS.enabled) === "1",
    eventId: parseEventId(map.get(OFEED_KEYS.eventId)),
    hasPassword: Boolean(map.get(OFEED_KEYS.password)),
    passwordSetAt: setAt && !Number.isNaN(setAt.getTime()) ? setAt : null,
  };
}
