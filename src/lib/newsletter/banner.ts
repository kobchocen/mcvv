/**
 * Volitelný banner v hlavičce newsletteru (Q27) – čistá logika bez DB a sítě.
 *
 * Banner je buď nahraný obrázek (tabulka `webimages`, typ „newsletter“, veřejně na
 * `/api/newsletter-banner?id=…`), nebo připravený statický banner z `public/images/newsletter`.
 * V e-mailu je vždy ODKAZEM na veřejnou absolutní URL (žádná příloha ani base64).
 */

/** Popis typu v `cis_typ_webimages` pro nahrané bannery (vytváří migrace). */
export const NEWSLETTER_BANNER_TYPE = "newsletter";

/** Nahraný banner se zmenší na tuto šířku (retina pro zobrazení v 600 px). */
export const BANNER_WIDTH = 1200;
/** Šířka banneru v e-mailu (šablona má 600 px). */
export const BANNER_DISPLAY_WIDTH = 600;
/** Užší obrázek by byl v e-mailu rozmazaný. */
export const BANNER_MIN_WIDTH = 600;
export const MAX_BANNER_BYTES = 1024 * 1024;
export const BANNER_ALT_MAX = 200;
export const BANNER_LINK_MAX = 500;
export const DEFAULT_BANNER_LINK = "https://mcvv.org";

export type BannerPreset = {
  key: string;
  label: string;
  /** Cesta k veřejnému souboru (public/…). */
  path: string;
  /** Navržený alt text (použije se, když pole alt zůstane prázdné). */
  alt: string;
};

export const NEWSLETTER_BANNER_PRESETS: readonly BannerPreset[] = [
  {
    key: "mcvv-2026",
    label: "MCVV 2026 – pozvánka (34. ročník, 6. 12. 2026)",
    path: "/images/newsletter/banner-2026.png",
    alt: "34. Malá cena Velké Verandy – neděle 6. 12. 2026, Choceň – Velká Veranda, 4 300 m, lesní kros. Přihlášky online do 2. 12. na mcvv.org",
  },
];

export function bannerPreset(key: string | null | undefined): BannerPreset | null {
  return NEWSLETTER_BANNER_PRESETS.find((preset) => preset.key === key) ?? null;
}

export function bannerImagePath(id: number): string {
  return `/api/newsletter-banner?id=${id}`;
}

export type BannerChoice =
  { kind: "none" } | { kind: "preset"; key: string } | { kind: "image"; id: number };

/** Hodnota pole „banner“ ve formuláři: "", "preset:<klíč>" nebo "image:<id>". Neplatná → null. */
export function parseBannerChoice(value: string | null | undefined): BannerChoice | null {
  const raw = (value ?? "").trim();
  if (!raw) return { kind: "none" };
  if (raw.startsWith("preset:")) {
    const key = raw.slice("preset:".length);
    return bannerPreset(key) ? { kind: "preset", key } : null;
  }
  const image = /^image:(\d{1,5})$/.exec(raw);
  if (image) {
    const id = Number(image[1]);
    return id > 0 && id <= 32767 ? { kind: "image", id } : null;
  }
  return null;
}

export function bannerChoiceValue(campaign: CampaignBannerFields): string {
  if (campaign.bannerImageId) return `image:${campaign.bannerImageId}`;
  if (bannerPreset(campaign.bannerPreset)) return `preset:${campaign.bannerPreset}`;
  return "";
}

/** Odkaz po kliknutí: prázdný → výchozí mcvv.org; jen http(s) bez přihlašovacích údajů. */
export function normalizeBannerLink(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  if (!raw) return DEFAULT_BANNER_LINK;
  if (raw.length > BANNER_LINK_MAX) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if ((url.protocol !== "https:" && url.protocol !== "http:") || url.username || url.password) {
    return null;
  }
  return url.toString();
}

export function normalizeBannerAlt(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim().slice(0, BANNER_ALT_MAX);
}

export type CampaignBannerFields = {
  bannerImageId: number | null;
  bannerPreset: string | null;
  bannerAlt: string | null;
  bannerLink: string | null;
};

export type NewsletterBanner = { src: string; alt: string; href: string };

/**
 * Banner kampaně pro šablonu. `origin` = absolutní základ URL (e-mail, např. https://mcvv.org);
 * prázdný řetězec = relativní cesta (náhled v administraci na stejném webu).
 */
export function campaignBanner(
  campaign: CampaignBannerFields,
  origin: string,
): NewsletterBanner | null {
  const base = origin.replace(/\/$/, "");
  const preset = bannerPreset(campaign.bannerPreset);
  const path = campaign.bannerImageId
    ? bannerImagePath(campaign.bannerImageId)
    : preset
      ? preset.path
      : null;
  if (!path) return null;
  const alt = normalizeBannerAlt(campaign.bannerAlt) || normalizeBannerAlt(preset?.alt);
  if (!alt) return null;
  return {
    src: `${base}${path}`,
    alt,
    href: normalizeBannerLink(campaign.bannerLink) ?? DEFAULT_BANNER_LINK,
  };
}

/** Relativní adresa obrázku vybraného v poli „banner“ (náhled v administraci), jinak null. */
export function bannerChoiceSrc(value: string | null | undefined): string | null {
  const choice = parseBannerChoice(value);
  if (!choice || choice.kind === "none") return null;
  return choice.kind === "image"
    ? bannerImagePath(choice.id)
    : (bannerPreset(choice.key)?.path ?? null);
}

/** Neuložený stav banneru ve formuláři kampaně (živý náhled). */
export type BannerDraft = {
  /** Hodnota pole „banner“: "", "preset:<klíč>" nebo "image:<id>". */
  choice: string;
  alt: string;
  link: string;
  /** Adresa nově vybraného (ještě nenahraného) souboru, typicky `blob:` z URL.createObjectURL. */
  uploadSrc?: string | null;
  /**
   * Týž soubor jako `data:` URL pro náhled e-mailu: iframe náhledu je sandboxovaný (neprůhledný
   * origin) a `blob:` adresu stránky v něm prohlížeč nenačte.
   */
  uploadDataUrl?: string | null;
  /** Chyba nového souboru zjištěná už v prohlížeči (typ, velikost, šířka) – uložení by selhalo. */
  uploadError?: BannerImageError | null;
};

export type BannerDraftResult =
  | { ok: true; banner: NewsletterBanner | null }
  | { ok: false; error: keyof typeof BANNER_ERROR_MESSAGES };

/**
 * Banner, který vznikne uložením neuloženého formuláře – stejná pravidla jako `saveNewsletter`
 * (nový soubor má přednost před výběrem, alt povinný u nahraného, u připraveného výchozí alt,
 * prázdný odkaz = mcvv.org). Při chybě se banner při uložení nezmění (`ok: false`).
 */
export function draftBanner(draft: BannerDraft, origin: string): BannerDraftResult {
  const alt = normalizeBannerAlt(draft.alt);
  const link = normalizeBannerLink(draft.link);
  if (!link) return { ok: false, error: "link" };
  if (draft.uploadSrc) {
    if (draft.uploadError) return { ok: false, error: draft.uploadError };
    if (!alt) return { ok: false, error: "alt" };
    // Stejně jako campaignBanner po uložení (odkaz se normalizuje znovu → „https://mcvv.org/“).
    const href = normalizeBannerLink(link) ?? DEFAULT_BANNER_LINK;
    return { ok: true, banner: { src: draft.uploadSrc, alt, href } };
  }
  const choice = parseBannerChoice(draft.choice);
  if (!choice) return { ok: false, error: "choice" };
  if (choice.kind === "none") return { ok: true, banner: null };
  if (choice.kind === "image" && !alt) return { ok: false, error: "alt" };
  const fields: CampaignBannerFields =
    choice.kind === "image"
      ? { bannerImageId: choice.id, bannerPreset: null, bannerAlt: alt, bannerLink: link }
      : {
          bannerImageId: null,
          bannerPreset: choice.key,
          bannerAlt: alt || normalizeBannerAlt(bannerPreset(choice.key)?.alt),
          bannerLink: link,
        };
  return { ok: true, banner: campaignBanner(fields, origin) };
}

export type BannerImageError = "empty" | "too_large" | "type" | "too_small" | "invalid";

/**
 * Rychlá kontrola vybraného souboru v prohlížeči (před nahráním). Server soubor stejně ověří
 * (`processBannerImage`); šířka je známá až po načtení obrázku (`width`, jinak se nekontroluje).
 */
export function bannerFileIssue(file: {
  size: number;
  type: string;
  width?: number;
}): BannerImageError | null {
  if (file.size <= 0) return "empty";
  if (file.size > MAX_BANNER_BYTES) return "too_large";
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return "type";
  if (file.width !== undefined && file.width < BANNER_MIN_WIDTH) return "too_small";
  return null;
}

export const BANNER_ERROR_MESSAGES: Record<BannerImageError | "alt" | "link" | "choice", string> = {
  empty: "Soubor s bannerem je prázdný.",
  too_large: "Banner je větší než 1 MB.",
  type: "Banner musí být JPG, PNG nebo WebP.",
  too_small: `Banner musí mít šířku alespoň ${BANNER_MIN_WIDTH} px (ideálně ${BANNER_WIDTH} px).`,
  invalid: "Obrázek banneru nejde načíst (poškozený soubor nebo nevhodný rozměr).",
  alt: "Banner musí mít alt text (popis obrázku pro čtečky a pro e-mailové klienty bez obrázků).",
  link: "Odkaz banneru musí být adresa http(s)://…",
  choice: "Vybraný banner neexistuje.",
};
