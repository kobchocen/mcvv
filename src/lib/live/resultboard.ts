import { getBuildInfo } from "@/lib/build-info";
import { prisma } from "@/lib/db/client";
import { partnerHref, partnerLogo } from "@/lib/partners/logos";

import { encodeOnline } from "./online-results-core";
import { ONLINE_RESULTS_CACHE_MS, loadOnlineSnapshot } from "./online-results";
import {
  RESULTBOARD_CONFIG_KEY,
  RESULTBOARD_CONFIG_POLL_MS,
  parseResultboardConfig,
  type BoardPartner,
  type ResultboardConfig,
} from "./resultboard-core";
import { createBodyCache } from "./speaker-cache";

/** Co si obrazovky (resultboard i speaker) stahují každých 30 s: nastavení, partneři, verze. */
export type ResultboardInfo = {
  config: ResultboardConfig;
  partners: BoardPartner[];
  /** Verze aplikace – po nasazení nové se kiosk sám obnoví. */
  build: string;
};

export const buildId = () => {
  const b = getBuildInfo();
  return `${b.version}+${b.buildNumber}.${b.revision}`;
};

export async function loadResultboardConfig(): Promise<ResultboardConfig> {
  const row = await prisma.setting.findUnique({ where: { key: RESULTBOARD_CONFIG_KEY } });
  return parseResultboardConfig(row?.text ?? null);
}

/** Aktivní partneři v pořadí webu (kategorie, pořadí) s logem; bez log se ukáže jméno. */
export async function loadBoardPartners(): Promise<BoardPartner[]> {
  try {
    const rows = await prisma.sponsor.findMany({
      where: { active: true },
      orderBy: [{ category: "asc" }, { order: "asc" }, { id: "asc" }],
      select: {
        id: true,
        name: true,
        link: true,
        image: true,
        category: true,
        logoType: true,
        logoHash: true,
        general: true,
      },
    });
    const seen = new Set<string>();
    const out: BoardPartner[] = [];
    for (const row of rows) {
      const name = row.name?.trim() || "Partner";
      if (seen.has(name)) continue;
      seen.add(name);
      out.push({
        id: row.id,
        name,
        category: row.category,
        logoSrc: partnerLogo(row)?.src ?? null,
        href: partnerHref(row.link),
        general: row.general,
      });
    }
    return out;
  } catch (error) {
    console.error("[resultboard] partners load failed", error);
    return [];
  }
}

export async function loadResultboardInfo(): Promise<ResultboardInfo> {
  const [config, partners] = await Promise.all([loadResultboardConfig(), loadBoardPartners()]);
  return { config, partners, build: buildId() };
}

/**
 * Sdílená cache na replice: jeden dotaz do DB za 30 s bez ohledu na počet obrazovek.
 * Uložení nastavení cache na své replice smaže, ostatní repliky se srovnají do 30 s.
 */
export const resultboardInfoCache = createBodyCache(
  loadResultboardInfo,
  RESULTBOARD_CONFIG_POLL_MS,
);

export const RESULTBOARD_INFO_CACHE_CONTROL = "public, max-age=30, s-maxage=30";

/** Snímek pro `?test=1` (jen přihlášení pořadatelé): jako veřejný, ale včetně testu. */
export const resultboardTestCache = createBodyCache(
  async () => encodeOnline(await loadOnlineSnapshot(new Date(), { includeTest: true })),
  ONLINE_RESULTS_CACHE_MS,
);
