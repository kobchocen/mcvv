/**
 * Nastavení OFeed (#122) v `mcvv_setting`; heslo je zašifrované (secret-box).
 * Dva profily (Q33): `live` = ostrá akce (původní klíče, beze změny), `test` = testovací akce
 * v OFeed pro generálku. `ofeed_profile` určuje, kam se nahrává; bez záznamu platí `live`.
 */
export const OFEED_KEYS = {
  enabled: "ofeed_enabled",
  profile: "ofeed_profile",
  eventId: "ofeed_event_id",
  password: "ofeed_password_enc",
  passwordSetAt: "ofeed_password_set_at",
  testEventId: "ofeed_test_event_id",
  testPassword: "ofeed_test_password_enc",
  testPasswordSetAt: "ofeed_test_password_set_at",
} as const;

/** Stav publikace v `mcvv_job_state` (sdílené s publisherem a vyčištěním mezičasů). */
export const OFEED_STATE = {
  lease: "ofeed_lease",
  lastHash: "ofeed_last_hash",
  lastOkAt: "ofeed_last_ok_at",
} as const;

export const OFEED_PROFILES = ["live", "test"] as const;
export type OfeedProfile = (typeof OFEED_PROFILES)[number];

/** Klíče jednoho profilu (ID akce, šifrované heslo, kdy bylo heslo uloženo). */
export function profileKeys(profile: OfeedProfile) {
  return profile === "test"
    ? {
        eventId: OFEED_KEYS.testEventId,
        password: OFEED_KEYS.testPassword,
        passwordSetAt: OFEED_KEYS.testPasswordSetAt,
      }
    : {
        eventId: OFEED_KEYS.eventId,
        password: OFEED_KEYS.password,
        passwordSetAt: OFEED_KEYS.passwordSetAt,
      };
}

export function parseProfile(raw: string | null | undefined): OfeedProfile | null {
  return raw === "live" || raw === "test" ? raw : null;
}

export const OFEED_SECRET_PURPOSE = "ofeed-password";
/** Heslo akce v OFeed platí 7 dní od vygenerování (docs „Vytvoření akce“). */
export const OFEED_PASSWORD_VALID_DAYS = 7;
export const OFEED_PUBLIC_ORIGIN = "https://orienteerfeed.com";
export const OFEED_BOARD_URL = "https://board.orienteerfeed.com";

export type OfeedProfileSettings = {
  eventId: string | null;
  /** Jen informace, jestli je heslo uložené – hodnota se z DB ven nedostane. */
  hasPassword: boolean;
  passwordSetAt: Date | null;
};

export type OfeedSettings = OfeedProfileSettings & {
  enabled: boolean;
  /** Aktivní profil; `eventId`/`hasPassword`/`passwordSetAt` nahoře patří jemu. */
  profile: OfeedProfile;
  profiles: Record<OfeedProfile, OfeedProfileSettings>;
  /**
   * ID akce, na kterou smí odkazovat veřejný web. Jen ostrá akce a jen když je aktivní –
   * při testovacím profilu web na OFeed neodkazuje vůbec (Q33).
   */
  publicEventId: string | null;
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

export function isOfeedUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === "orienteerfeed.com" || host.endsWith(".orienteerfeed.com");
  } catch {
    return false;
  }
}

/**
 * Odkaz „Online výsledky“: ručně zadaná URL má přednost, jinak akce v OFeed.
 * Při testovacím profilu (`ofeed.publicEventId` je null a `profile` test) se nezobrazí ani
 * ručně zadaná URL mířící na orienteerfeed.com – veřejnost nemá vidět testovací data.
 */
export function resolveOnlineResultsUrl(
  manualUrl: string | null,
  ofeed: Pick<OfeedSettings, "profile" | "publicEventId"> | null,
): string | null {
  const testing = ofeed?.profile === "test";
  if (manualUrl) return testing && isOfeedUrl(manualUrl) ? null : manualUrl;
  return ofeed?.publicEventId ? ofeedPublicUrl(ofeed.publicEventId) : null;
}

export function settingsFromRows(rows: { key: string; text: string }[]): OfeedSettings {
  const map = new Map(rows.map((row) => [row.key, row.text]));
  const read = (profile: OfeedProfile): OfeedProfileSettings => {
    const keys = profileKeys(profile);
    const setAtRaw = map.get(keys.passwordSetAt);
    const setAt = setAtRaw ? new Date(setAtRaw) : null;
    return {
      eventId: parseEventId(map.get(keys.eventId)),
      hasPassword: Boolean(map.get(keys.password)),
      passwordSetAt: setAt && !Number.isNaN(setAt.getTime()) ? setAt : null,
    };
  };
  const profiles = { live: read("live"), test: read("test") };
  const profile = parseProfile(map.get(OFEED_KEYS.profile)) ?? "live";
  return {
    enabled: map.get(OFEED_KEYS.enabled) === "1",
    profile,
    ...profiles[profile],
    profiles,
    publicEventId: profile === "live" ? profiles.live.eventId : null,
  };
}
