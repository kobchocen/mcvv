/**
 * Neuložené změny ve formuláři kampaně: porovnání aktuálních polí s uloženou verzí.
 * Čisté funkce (bez Reactu a DOM) – používá je formulář a testy.
 */

/** Volby „Účastníci z přihlášek za posledních N let“ (0 = nezahrnovat). */
export const NEWSLETTER_YEAR_OPTIONS = [0, 1, 2, 3, 5, 10, 20];

export type NewsletterFormSnapshot = {
  subject: string;
  body: string;
  audienceUsers: boolean;
  audienceYears: number;
  excludeCurrentEntrants: boolean;
  banner: string;
  bannerAlt: string;
  bannerLink: string;
  /** Vybraný nový soubor banneru ("" = žádný). */
  bannerFile: string;
};

const normalizeText = (value: string) => value.replace(/\r\n?/g, "\n");
const normalizeLine = (value: string) => value.replace(/\s+/g, " ").trim();

/** Uložené hodnoty (props formuláře) → snímek. */
export function snapshotFromValues(values: {
  subject: string;
  body: string;
  audienceUsers: boolean;
  audienceYears: number;
  excludeCurrentEntrants: boolean;
  banner: string;
  bannerAlt: string;
  bannerLink: string;
}): NewsletterFormSnapshot {
  return {
    subject: values.subject.trim(),
    body: normalizeText(values.body),
    audienceUsers: values.audienceUsers,
    audienceYears: values.audienceYears,
    excludeCurrentEntrants: values.excludeCurrentEntrants,
    banner: values.banner,
    bannerAlt: normalizeLine(values.bannerAlt),
    bannerLink: values.bannerLink.trim(),
    bannerFile: "",
  };
}

/** Pole formuláře (FormData) → snímek; stejné normalizace jako uložení na serveru. */
export function snapshotFromForm(data: Pick<FormData, "get">): NewsletterFormSnapshot {
  const text = (name: string) => {
    const value = data.get(name);
    return typeof value === "string" ? value : "";
  };
  const file = data.get("bannerFile");
  const years = Number.parseInt(text("audienceYears"), 10);
  return {
    subject: text("subject").trim(),
    body: normalizeText(text("body")),
    audienceUsers: data.get("audienceUsers") !== null,
    audienceYears: Number.isFinite(years) ? years : 0,
    excludeCurrentEntrants: data.get("excludeCurrentEntrants") !== null,
    banner: text("banner"),
    bannerAlt: normalizeLine(text("bannerAlt")),
    bannerLink: text("bannerLink").trim(),
    bannerFile:
      file && typeof file === "object" && "size" in file && file.size > 0
        ? `${file.name}:${file.size}`
        : "",
  };
}

const GROUPS: [label: string, keys: (keyof NewsletterFormSnapshot)[]][] = [
  ["předmět", ["subject"]],
  ["text", ["body"]],
  ["banner", ["banner", "bannerAlt", "bannerLink", "bannerFile"]],
  ["publikum", ["audienceUsers", "audienceYears", "excludeCurrentEntrants"]],
];

/** Co se změnilo proti uložené verzi (české názvy pro výzvu); prázdné = nic neuloženého. */
export function changedNewsletterFields(
  current: NewsletterFormSnapshot,
  saved: NewsletterFormSnapshot,
): string[] {
  return GROUPS.filter(([, keys]) => keys.some((key) => current[key] !== saved[key])).map(
    ([label]) => label,
  );
}

const TIME = new Intl.DateTimeFormat("cs-CZ", {
  timeZone: "Europe/Prague",
  hour: "2-digit",
  minute: "2-digit",
});

/** „HH:MM“ v pražském čase (uložení konceptu). */
export function formatSavedTime(value: Date | string): string {
  return TIME.format(typeof value === "string" ? new Date(value) : value);
}
