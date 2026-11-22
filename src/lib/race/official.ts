import { prisma } from "@/lib/db/client";
import { writeAudit, type AuditActor } from "@/lib/audit/log";
import { currentRaceYear } from "@/lib/entries/year";
import { FINISH_SPLIT_CODE } from "@/lib/live/finish-core";
import { peekStoredTestRun } from "@/lib/live/test-run";
import { raceStartFor } from "@/lib/race/phase";
import { loadRoster } from "@/lib/race/roster";
import { recalculateCategoryRecords } from "@/lib/stats/records";

import {
  buildOfficialPreview,
  LIVE_WINDOW_KEY,
  liveWindowState,
  officialCheckKey,
  officialPublishedKey,
  parseLiveWindow,
  parseStamp,
  publishBlock,
  type LiveWindowMode,
  type LiveWindowState,
  type OfficialPreview,
  type OfficialStamp,
  type PublishBlock,
} from "./official-core";

export type LiveWindow = {
  year: number;
  state: LiveWindowState;
  mode: LiveWindowMode;
  raceStart: Date;
};

/** Okno veřejných živých výsledků (úvodní stránka, `/vysledky/online`, API). */
export async function loadLiveWindow(now = new Date()): Promise<LiveWindow> {
  const race = await currentRaceYear();
  const raceStart = raceStartFor(race.raceDate, race.year, race.startModel.zeroSeconds);
  const rows = await prisma.setting.findMany({
    where: { key: { in: [LIVE_WINDOW_KEY, officialPublishedKey(race.year)] } },
    select: { key: true, text: true },
  });
  const text = (key: string) => rows.find((row) => row.key === key)?.text ?? null;
  const mode = parseLiveWindow(text(LIVE_WINDOW_KEY), race.year);
  const published = parseStamp(text(officialPublishedKey(race.year))) !== null;
  return {
    year: race.year,
    mode,
    raceStart,
    state: liveWindowState({ now, raceStart, mode, published }),
  };
}

export type OfficialState = {
  year: number;
  preview: OfficialPreview;
  check: OfficialStamp | null;
  published: OfficialStamp | null;
  existingResults: number;
  testRunning: boolean;
  block: PublishBlock | null;
  window: LiveWindow;
};

type Db = typeof prisma | Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function previewFor(db: Db, year: number): Promise<OfficialPreview> {
  const [roster, finish, starts] = await Promise.all([
    loadRoster(year, { db }),
    db.split.findMany({
      where: { year, split: FINISH_SPLIT_CODE },
      select: { bib: true, time: true },
    }),
    db.startCheck.findMany({ where: { year }, select: { bib: true } }),
  ]);
  return buildOfficialPreview(
    roster,
    new Map(finish.map((row) => [row.bib, row.time])),
    new Set(starts.map((row) => row.bib)),
  );
}

async function stamps(db: Db, year: number) {
  const rows = await db.setting.findMany({
    where: { key: { in: [officialCheckKey(year), officialPublishedKey(year)] } },
    select: { key: true, text: true },
  });
  const text = (key: string) => rows.find((row) => row.key === key)?.text ?? null;
  return {
    check: parseStamp(text(officialCheckKey(year))),
    published: parseStamp(text(officialPublishedKey(year))),
  };
}

/** Stav pro stránku Oficiální výsledky: náhled, kontrola, zveřejnění a okno živých výsledků. */
export async function loadOfficialState(now = new Date()): Promise<OfficialState> {
  const window = await loadLiveWindow(now);
  const year = window.year;
  const [preview, { check, published }, existingResults, { run }] = await Promise.all([
    previewFor(prisma, year),
    stamps(prisma, year),
    prisma.result.count({ where: { year } }),
    peekStoredTestRun(now),
  ]);
  const testRunning = run !== null;
  return {
    year,
    preview,
    check,
    published,
    existingResults,
    testRunning,
    block: publishBlock({ preview, check, published, existingResults, testRunning }),
    window,
  };
}

function actorLabel(actor: AuditActor): string {
  return actor.email ?? `user:${actor.id ?? "-"}`;
}

/**
 * Kontrola hlavním rozhodčím: potvrdí přesně zobrazený náhled (otisk). Změní-li se potom
 * jakýkoli čas, kontrola propadne a zveřejnit nejde, dokud ji rozhodčí nepotvrdí znovu.
 */
export async function markOfficialChecked(
  actor: AuditActor,
  expectedHash: string,
  now = new Date(),
): Promise<"ok" | "changed" | "published" | "empty"> {
  const state = await loadOfficialState(now);
  if (state.published) return "published";
  if (state.preview.rows.length === 0) return "empty";
  if (state.preview.hash !== expectedHash) return "changed";
  const stamp: OfficialStamp = {
    at: now.toISOString(),
    by: actorLabel(actor),
    hash: state.preview.hash,
    count: state.preview.rows.length,
  };
  const key = officialCheckKey(state.year);
  const text = JSON.stringify(stamp);
  await prisma.$transaction(async (tx) => {
    await tx.setting.upsert({ where: { key }, update: { text }, create: { key, text } });
    await writeAudit(
      {
        actor,
        action: "results.official_checked",
        target: `year:${state.year}`,
        detail: { ...stamp, issues: state.preview.issues.length, noFinish: state.preview.noFinish },
        meta: { year: state.year, entity: "results" },
      },
      tx,
    );
  });
  return "ok";
}

export type PublishResult =
  { ok: true; count: number } | { ok: false; error: PublishBlock | "changed" };

/**
 * Zveřejnění oficiálních výsledků: časy ze zkontrolovaného náhledu → `mcvv_time`, přepočet
 * rekordů kategorií, příznak zveřejnění (zavře okno živých výsledků) a audit. Vše v jedné
 * transakci; znovu se náhled počítá uvnitř a musí sedět s kontrolou rozhodčího.
 */
export async function publishOfficialResults(
  actor: AuditActor,
  expectedHash: string,
  now = new Date(),
): Promise<PublishResult> {
  const race = await currentRaceYear();
  const year = race.year;
  const { run } = await peekStoredTestRun(now);
  return prisma.$transaction(
    async (tx) => {
      const preview = await previewFor(tx, year);
      const { check, published } = await stamps(tx, year);
      const existingResults = await tx.result.count({ where: { year } });
      const block = publishBlock({
        preview,
        check,
        published,
        existingResults,
        testRunning: run !== null,
      });
      if (block) return { ok: false, error: block } as const;
      if (preview.hash !== expectedHash) return { ok: false, error: "changed" } as const;
      await tx.result.createMany({
        data: preview.rows.map((row) => ({
          runnerId: row.runnerId,
          year,
          clubId: row.clubId,
          categoryId: row.categoryId,
          time: row.time,
          runnerName: row.runnerName.slice(0, 50),
          clubName: row.clubName.slice(0, 50),
        })),
      });
      const records = await recalculateCategoryRecords(tx);
      const stamp: OfficialStamp = {
        at: now.toISOString(),
        by: actorLabel(actor),
        hash: preview.hash,
        count: preview.rows.length,
      };
      const key = officialPublishedKey(year);
      const text = JSON.stringify(stamp);
      await tx.setting.upsert({ where: { key }, update: { text }, create: { key, text } });
      await writeAudit(
        {
          actor,
          action: "results.official_published",
          target: `year:${year}`,
          detail: { ...stamp, checkedBy: check?.by ?? null, records },
          meta: { year, entity: "results" },
        },
        tx,
      );
      return { ok: true, count: preview.rows.length } as const;
    },
    { timeout: 60_000 },
  );
}

/** Ruční otevření / nouzové zavření okna živých výsledků (jen admin, audit). */
export async function setLiveWindowMode(
  actor: AuditActor,
  mode: LiveWindowMode,
  now = new Date(),
): Promise<LiveWindow> {
  const before = await loadLiveWindow(now);
  const text = JSON.stringify({ year: before.year, mode });
  await prisma.$transaction(async (tx) => {
    await tx.setting.upsert({
      where: { key: LIVE_WINDOW_KEY },
      update: { text },
      create: { key: LIVE_WINDOW_KEY, text },
    });
    await writeAudit(
      {
        actor,
        action: "raceday.live_window",
        target: `year:${before.year}`,
        detail: { from: before.mode, to: mode, state: before.state },
        meta: { year: before.year, entity: "live" },
      },
      tx,
    );
  });
  return loadLiveWindow(now);
}
