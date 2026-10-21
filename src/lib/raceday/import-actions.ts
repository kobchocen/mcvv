"use server";

import { createHash } from "node:crypto";
import { revalidatePath, revalidateTag } from "next/cache";
import { getTranslations } from "next-intl/server";

import { requireRaceDay } from "@/lib/admin/staff";
import { currentRaceYear } from "@/lib/entries/year";
import { STATS_CACHE_TAG } from "@/lib/stats/overview-query";

import {
  decodeObdFile,
  ObdDecodeError,
  parseClubsFile,
  parseRaceFile,
  parseRunnersFile,
  splitObdLines,
  type ObdFileEncoding,
  type ObdFileKind,
  type ObdRowError,
} from "./obd-csv";
import {
  planPresentationImport,
  planResultsImport,
  presentationHasChanges,
  type PresentationFiles,
} from "./obd-import";
import {
  applyPresentationPlan,
  applyResultsPlan,
  loadCategoryIds,
  loadPresentationSnapshot,
  loadResultsSnapshot,
} from "./obd-import-data";
import { section, type ImportState, type ImportView } from "./import-view";

const MAX_FILE_BYTES = 900 * 1024;

type Translate = Awaited<ReturnType<typeof getTranslations<"RaceDayImport">>>;

type UploadedFile = {
  kind: ObdFileKind;
  name: string;
  sha256: string;
  text: string;
  encoding: ObdFileEncoding;
};

async function readUpload(
  formData: FormData,
  kind: ObdFileKind,
  t: Translate,
): Promise<UploadedFile | null | string> {
  const value = formData.get(kind);
  if (!(value instanceof File) || value.size === 0) return null;
  if (value.size > MAX_FILE_BYTES) return t("errTooLarge", { file: `${kind}.csv` });
  const bytes = new Uint8Array(await value.arrayBuffer());
  try {
    const decoded = decodeObdFile(bytes);
    return {
      kind,
      name: value.name.slice(0, 120),
      sha256: createHash("sha256").update(bytes).digest("hex"),
      ...decoded,
    };
  } catch (error) {
    if (error instanceof ObdDecodeError) return t("errDecode", { file: `${kind}.csv` });
    throw error;
  }
}

function rowError(t: Translate, error: ObdRowError): string {
  const text = t("rowError", {
    file: `${error.file}.csv`,
    line: error.line,
    message: t(`err_${error.code}`),
  });
  return error.value ? `${text}: „${error.value.slice(0, 80)}“` : text;
}

function encodingWarnings(t: Translate, files: UploadedFile[]): string[] {
  return files
    .filter((file) => file.encoding !== "windows-1250")
    .map((file) =>
      t(file.encoding === "utf-8" ? "warnUtf8" : "warnUtf8Bom", { file: `${file.kind}.csv` }),
    );
}

function fileMeta(file: UploadedFile | null, rows: number) {
  return file ? { name: file.name, sha256: file.sha256, rows } : undefined;
}

/**
 * Import po prezentaci z OBD (#119): cis_bezec.csv, cis_klub.csv, start.csv (libovolná
 * kombinace). `intent=preview` jen spočítá náhled; `intent=commit` znovu načte soubory,
 * přepočítá plán nad aktuální DB a zapíše ho jen tehdy, když odpovídá náhledu (hash).
 */
export async function presentationImportAction(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const session = await requireRaceDay();
  const t = await getTranslations("RaceDayImport");
  const intent = formData.get("intent") === "commit" ? "commit" : "preview";

  const uploads: UploadedFile[] = [];
  for (const kind of ["cis_bezec", "cis_klub", "start"] as const) {
    const upload = await readUpload(formData, kind, t);
    if (typeof upload === "string") return { status: "error", message: upload };
    if (upload) uploads.push(upload);
  }
  if (uploads.length === 0) return { status: "error", message: t("errNoFile") };

  const { year } = await currentRaceYear();
  const categories = await loadCategoryIds();
  const byKind = (kind: ObdFileKind) => uploads.find((file) => file.kind === kind) ?? null;
  const runnersFile = byKind("cis_bezec");
  const clubsFile = byKind("cis_klub");
  const startFile = byKind("start");
  const runners = runnersFile ? parseRunnersFile(splitObdLines(runnersFile.text)) : null;
  const clubs = clubsFile ? parseClubsFile(splitObdLines(clubsFile.text)) : null;
  const starts = startFile
    ? parseRaceFile("start", splitObdLines(startFile.text), {
        year,
        categoryIds: new Set(categories.keys()),
      })
    : null;
  const files: PresentationFiles = {
    runners: runners?.rows,
    clubs: clubs?.rows,
    starts: starts?.rows,
  };
  const snapshot = await loadPresentationSnapshot(year);
  const plan = planPresentationImport(snapshot, files);
  const errors = [
    ...(runners?.errors ?? []),
    ...(clubs?.errors ?? []),
    ...(starts?.errors ?? []),
    ...plan.errors,
  ].map((error) => rowError(t, error));

  const warnings = encodingWarnings(t, uploads);
  if (plan.copiedClubs.length > 0) {
    warnings.push(
      t("warnCopiedClubs", { clubs: plan.copiedClubs.map((c) => `${c.id} ${c.name}`).join(", ") }),
    );
  }
  if (plan.runnerNameDiffs.length > 0) {
    warnings.push(t("warnRunnerNames", { count: plan.runnerNameDiffs.length }));
  }
  if (plan.clubNameDiffs.length > 0) {
    warnings.push(t("warnClubNames", { count: plan.clubNameDiffs.length }));
  }
  const name = (id: string) => snapshot.runners.get(id) ?? "";
  const view: ImportView = {
    summary: [
      { label: t("sumYear"), value: year },
      ...(runners
        ? [
            {
              label: t("sumRunners"),
              value: t("sumNew", { count: plan.newRunners.length, total: runners.rows.length }),
            },
          ]
        : []),
      ...(clubs
        ? [
            {
              label: t("sumClubs"),
              value: t("sumNew", { count: plan.newClubs.length, total: clubs.rows.length }),
            },
          ]
        : []),
      ...(plan.start
        ? [
            {
              label: t("sumStart"),
              value: plan.start.unchanged
                ? t("sumStartUnchanged", { count: plan.start.rows.length })
                : t("sumStartReplace", {
                    count: plan.start.rows.length,
                    replaced: plan.start.replaced,
                  }),
            },
          ]
        : []),
    ],
    errors,
    warnings,
    sections: [
      section(
        t("secNewRunners"),
        [t("colId"), t("colName")],
        plan.newRunners.map((r) => [r.id, r.name]),
      ),
      section(
        t("secNewClubs"),
        [t("colId"), t("colName")],
        plan.newClubs.map((r) => [r.id, r.name]),
      ),
      section(
        t("secRunnerNames"),
        [t("colId"), t("colCurrent"), t("colFile")],
        plan.runnerNameDiffs.map((d) => [d.id, d.current, d.file]),
      ),
      section(
        t("secClubNames"),
        [t("colId"), t("colCurrent"), t("colFile")],
        plan.clubNameDiffs.map((d) => [d.id, d.current, d.file]),
      ),
      ...(plan.start
        ? [
            section(
              t("secBibChanges"),
              [t("colId"), t("colName"), t("colFrom"), t("colTo")],
              plan.start.bibChanges.map((c) => [c.runnerId, name(c.runnerId), c.from, c.to]),
            ),
            section(
              t("secWalkIns"),
              [t("colBib"), t("colId"), t("colName")],
              plan.start.rows
                .filter((row) => plan.start!.walkIns.includes(row.runnerId))
                .map((row) => [row.bib, row.runnerId, row.runnerName]),
            ),
            section(
              t("secMissing"),
              [t("colBib"), t("colId"), t("colName")],
              plan.start.missing.map((m) => [m.bib, m.runnerId, name(m.runnerId)]),
            ),
          ]
        : []),
    ].filter((item) => item.rows.length > 0),
    unchanged: !presentationHasChanges(plan),
  };

  if (errors.length > 0) {
    return { status: "error", message: t("errInvalid", { count: errors.length }), view };
  }
  if (intent === "preview") return { status: "preview", hash: plan.hash, view };
  if (formData.get("hash") !== plan.hash) {
    return { status: "error", message: t("errChanged"), view };
  }
  if (view.unchanged) return { status: "done", message: t("doneUnchanged"), view };
  await applyPresentationPlan(plan, session, {
    cis_bezec: fileMeta(runnersFile, runners?.rows.length ?? 0),
    cis_klub: fileMeta(clubsFile, clubs?.rows.length ?? 0),
    start: fileMeta(startFile, starts?.rows.length ?? 0),
  });
  revalidatePath("/[locale]/admin/den-zavodu", "layout");
  revalidatePath("/[locale]/startovka", "page");
  return { status: "done", message: t("donePresentation"), view };
}

/**
 * Import oficiálních výsledků kon_vysl.csv do mcvv_time (#123). Stejný postup
 * náhled → potvrzení (hash) jako u importu po prezentaci.
 */
export async function resultsImportAction(
  _prev: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const session = await requireRaceDay();
  const t = await getTranslations("RaceDayImport");
  const intent = formData.get("intent") === "commit" ? "commit" : "preview";
  const upload = await readUpload(formData, "kon_vysl", t);
  if (typeof upload === "string") return { status: "error", message: upload };
  if (!upload) return { status: "error", message: t("errNoFile") };

  const { year } = await currentRaceYear();
  const snapshot = await loadResultsSnapshot(year);
  const parsed = parseRaceFile("kon_vysl", splitObdLines(upload.text), {
    year,
    categoryIds: new Set(snapshot.categories.keys()),
  });
  const plan = planResultsImport(snapshot, parsed.rows);
  const errors = [...parsed.errors, ...plan.errors].map((error) => rowError(t, error));
  const warnings = encodingWarnings(t, [upload]);
  if (plan.copiedClubs.length > 0) {
    warnings.push(
      t("warnCopiedClubs", { clubs: plan.copiedClubs.map((c) => `${c.id} ${c.name}`).join(", ") }),
    );
  }
  if (plan.withoutSplit > 0) warnings.push(t("warnWithoutSplit", { count: plan.withoutSplit }));
  const name = (id: string) => snapshot.runners.get(id) ?? "";
  const time = (seconds: number) =>
    `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const view: ImportView = {
    summary: [
      { label: t("sumYear"), value: year },
      {
        label: t("sumResults"),
        value: plan.unchanged
          ? t("sumStartUnchanged", { count: plan.rows.length })
          : t("sumStartReplace", { count: plan.rows.length, replaced: plan.replaced }),
      },
      ...plan.perCategory.map((c) => ({ label: `${c.categoryId} ${c.name}`, value: c.count })),
    ],
    errors,
    warnings,
    sections: [
      section(
        t("secSplitDiffs"),
        [t("colBib"), t("colId"), t("colName"), t("colOfficial"), t("colSplit"), t("colDiff")],
        plan.splitDiffs.map((d) => [
          d.bib,
          d.runnerId,
          name(d.runnerId),
          time(d.official),
          time(d.split),
          `${d.official - d.split > 0 ? "+" : ""}${d.official - d.split} s`,
        ]),
      ),
      section(
        t("secWithoutStart"),
        [t("colId"), t("colName")],
        plan.withoutStart.map((id) => [id, name(id)]),
      ),
    ].filter((item) => item.rows.length > 0),
    unchanged: plan.unchanged && plan.copiedClubs.length === 0,
  };

  if (errors.length > 0) {
    return { status: "error", message: t("errInvalid", { count: errors.length }), view };
  }
  if (intent === "preview") return { status: "preview", hash: plan.hash, view };
  if (formData.get("hash") !== plan.hash) {
    return { status: "error", message: t("errChanged"), view };
  }
  if (view.unchanged) return { status: "done", message: t("doneUnchanged"), view };
  await applyResultsPlan(plan, session, {
    name: upload.name,
    sha256: upload.sha256,
    rows: parsed.rows.length,
  });
  revalidateTag(STATS_CACHE_TAG, "max");
  revalidatePath("/[locale]/results", "layout");
  revalidatePath("/[locale]/vysledky", "page");
  revalidatePath("/[locale]/statistiky", "layout");
  revalidatePath("/[locale]/admin/den-zavodu", "layout");
  return { status: "done", message: t("doneResults", { count: plan.rows.length }), view };
}
