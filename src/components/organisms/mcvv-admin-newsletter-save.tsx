"use client";

import { formatSavedTime } from "@/lib/newsletter/form-state";

/** Stav tlačítka „Uložit koncept“ a hlášky vedle něj (čistá funkce kvůli testům). */
export function saveButtonState(input: { isNew: boolean; dirty: boolean; pending: boolean }): {
  disabled: boolean;
  label: string;
} {
  if (input.pending) return { disabled: true, label: "Ukládám…" };
  return { disabled: !input.isNew && !input.dirty, label: "Uložit koncept" };
}

export type SaveFeedback =
  { kind: "saved"; at: string; bannerError?: string } | { kind: "error"; message: string } | null;

/** Hláška vedle tlačítka po uložení / při chybě. */
export function McvvSaveStatus({
  pending,
  feedback,
  dirty,
}: {
  pending: boolean;
  feedback: SaveFeedback;
  dirty: boolean;
}) {
  if (pending) {
    // Spinner a „Ukládám…“ ukazuje tlačítko; tady jen hlášení pro čtečky.
    return (
      <span data-slot="save-status" role="status" className="sr-only">
        Ukládám…
      </span>
    );
  }
  if (!feedback) return null;
  // Po další změně už „Uloženo v …“ neplatí (zůstává jen chyba banneru).
  if (feedback.kind === "saved" && dirty && !feedback.bannerError) return null;
  if (feedback.kind === "error") {
    return (
      <span data-slot="save-status" role="alert" className="text-sm text-red-600 dark:text-red-400">
        Uložení se nezdařilo: {feedback.message}
      </span>
    );
  }
  return (
    <span data-slot="save-status" role="status" className="grid gap-1 text-sm">
      {feedback.bannerError ? (
        <span className="text-red-600 dark:text-red-400">
          {feedback.bannerError} Ostatní úpravy jsou uložené.
        </span>
      ) : null}
      {dirty && !feedback.bannerError ? null : (
        <span className="text-emerald-700 dark:text-emerald-400">
          Uloženo v {formatSavedTime(feedback.at)}
        </span>
      )}
    </span>
  );
}
