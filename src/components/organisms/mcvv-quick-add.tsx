"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";

import { addExistingRunner } from "@/lib/entries/actions";
import { hideQuickRunner, restoreQuickRunners } from "@/lib/entries/quick-actions";
import type { QuickHiddenResult } from "@/lib/entries/quick-actions";
import { compareQuick, quickLabels } from "@/lib/entries/quick";
import {
  McvvQuickAddView,
  type QuickAddCopy,
  type QuickAddRunner,
} from "@/components/organisms/mcvv-quick-add-view";

export type { QuickAddCopy } from "@/components/organisms/mcvv-quick-add-view";

/**
 * Rychlá nabídka na /prihlasky: běžci z minulých přihlášek. Křížkem se běžec skryje
 * („už nenabízet“, MD-31) – hned zmizí (optimisticky), uloží se k účtu a nabídne se „Zpět“.
 * Skryté lze rozbalit a vrátit. Při chybě serveru se změna vrátí a ukáže se hláška.
 */
export function McvvQuickAdd({
  year,
  registrationId,
  runners,
  hidden,
  clubName,
  copy,
}: {
  year: number;
  /** null = přihláška ještě neexistuje, založí se s prvním běžcem. */
  registrationId: number | null;
  /** Nabízení běžci (bez skrytých). */
  runners: QuickAddRunner[];
  /** Běžci skrytí účtem. */
  hidden: QuickAddRunner[];
  clubName: string;
  copy: QuickAddCopy;
}) {
  // Optimistické skrytí / vrácení podle id (true = skrytý); server je po revalidaci shodný.
  const [overrides, setOverrides] = useState<ReadonlyMap<string, boolean>>(new Map());
  const [notice, setNotice] = useState<QuickAddRunner | null>(null);
  const [error, setError] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [, startTransition] = useTransition();
  const undoRef = useRef<HTMLButtonElement>(null);

  const all = useMemo(
    () =>
      [...new Map([...runners, ...hidden].map((runner) => [runner.id, runner])).values()].sort(
        compareQuick,
      ),
    [runners, hidden],
  );
  const serverHidden = useMemo(() => new Set(hidden.map((runner) => runner.id)), [hidden]);
  const labels = useMemo(() => quickLabels(all), [all]);
  const isHidden = (id: string) => overrides.get(id) ?? serverHidden.has(id);
  const visibleList = all.filter((runner) => !isHidden(runner.id));
  const hiddenList = all.filter((runner) => isHidden(runner.id));

  // Po skrytí přejde fokus na „Zpět“ (tlačítko s fokusem zmizelo).
  useEffect(() => {
    if (notice) undoRef.current?.focus();
  }, [notice]);

  const run = (ids: string[], hide: boolean, action: () => Promise<QuickHiddenResult>) => {
    setError(false);
    setOverrides((prev) => new Map([...prev, ...ids.map((id) => [id, hide] as const)]));
    startTransition(async () => {
      let ok = false;
      try {
        ok = (await action()).ok;
      } catch {
        ok = false;
      }
      if (!ok) {
        setOverrides((prev) => new Map([...prev].filter(([id]) => !ids.includes(id))));
        setNotice(null);
        setError(true);
      }
    });
  };

  return (
    <McvvQuickAddView
      year={year}
      registrationId={registrationId}
      clubName={clubName}
      runners={visibleList}
      hidden={hiddenList}
      labels={labels}
      notice={notice}
      error={error}
      showHidden={showHidden}
      copy={copy}
      addAction={addExistingRunner}
      undoRef={undoRef}
      onHide={(runner) => {
        setNotice(runner);
        run([runner.id], true, () => hideQuickRunner(runner.id));
      }}
      onUndo={() => {
        if (!notice) return;
        const runner = notice;
        setNotice(null);
        run([runner.id], false, () => restoreQuickRunners([runner.id]));
      }}
      onToggleHidden={() => setShowHidden((open) => !open)}
      onRestore={(runner) => {
        if (notice?.id === runner.id) setNotice(null);
        run([runner.id], false, () => restoreQuickRunners([runner.id]));
      }}
      onRestoreAll={() => {
        setNotice(null);
        run(
          hiddenList.map((runner) => runner.id),
          false,
          () => restoreQuickRunners("all"),
        );
      }}
    />
  );
}
