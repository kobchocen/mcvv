"use client";

import type { Ref } from "react";
import { useFormStatus } from "react-dom";
import {
  ChevronDownIcon,
  EyeOffIcon,
  Loader2Icon,
  RotateCcwIcon,
  Undo2Icon,
  XIcon,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Běžec rychlé nabídky: klub z poslední přihlášky běžce, jinak výchozí klub přihlášky (Q35). */
export type QuickAddRunner = { id: string; name: string; clubId?: string; clubName?: string };

export type QuickAddCopy = {
  quickAdd: string;
  /** Šablona tooltipu tlačítka: `{name}`, `{year}`. */
  runnerTitle: string;
  hint: string;
  /** `{name}` – aria-label křížku. */
  hide: string;
  /** `{name}` – hláška po skrytí. */
  hiddenNotice: string;
  undo: string;
  /** `{count}` */
  hiddenToggle: string;
  hiddenShow: string;
  hiddenCollapse: string;
  /** `{name}` – aria-label vrácení. */
  restore: string;
  restoreAll: string;
  allHidden: string;
  error: string;
};

export function fillCopy(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

/**
 * Tlačítko běžce v rychlé nabídce. Hned po kliknutí ukáže, že se běžec přidává (#189):
 * zablokuje se, točí se ikonka a `aria-busy`. Běžec z nabídky zmizí, až ho server uloží
 * a stránka se obnoví.
 */
function QuickAddButton({ label, title }: { label: string; title: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="ghost"
      disabled={pending}
      aria-busy={pending || undefined}
      className="h-full rounded-none px-3.5 disabled:opacity-70"
      title={title}
      aria-label={title}
    >
      {pending ? <Loader2Icon className="size-4 animate-spin" aria-hidden="true" /> : null}
      {label}
    </Button>
  );
}

export const QUICK_HIDDEN_LIST_ID = "quick-add-hidden";

/**
 * Rychlá nabídka (čisté vykreslení, stav drží `McvvQuickAdd`). Každý běžec = tlačítko
 * „přidat“ + křížek „už nenabízet“ (MD-31). Pod nabídkou hláška se „Zpět“ a rozbalovací
 * seznam skrytých běžců s vrácením.
 */
export function McvvQuickAddView({
  year,
  registrationId,
  clubName,
  runners,
  hidden,
  labels,
  notice,
  error,
  showHidden,
  copy,
  addAction,
  onHide,
  onUndo,
  onToggleHidden,
  onRestore,
  onRestoreAll,
  undoRef,
}: {
  year: number;
  /** null = přihláška ještě neexistuje, založí se s prvním běžcem. */
  registrationId: number | null;
  clubName: string;
  runners: readonly QuickAddRunner[];
  hidden: readonly QuickAddRunner[];
  /** Popisek tlačítka podle id (u jmenovců s ročníkem). */
  labels: ReadonlyMap<string, string>;
  /** Právě skrytý běžec (hláška se „Zpět“). */
  notice: QuickAddRunner | null;
  error: boolean;
  showHidden: boolean;
  copy: QuickAddCopy;
  addAction: (formData: FormData) => void | Promise<void>;
  onHide: (runner: QuickAddRunner) => void;
  onUndo: () => void;
  onToggleHidden: () => void;
  onRestore: (runner: QuickAddRunner) => void;
  onRestoreAll: () => void;
  undoRef?: Ref<HTMLButtonElement>;
}) {
  const labelOf = (runner: QuickAddRunner) => labels.get(runner.id) ?? runner.name;
  return (
    <div className="mt-6" data-slot="quick-add">
      <h3 className="font-display text-lg font-semibold">{copy.quickAdd}</h3>
      <p className="mt-1 max-w-2xl text-sm text-race-muted">{copy.hint}</p>
      {runners.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {runners.map((runner) => {
            const label = labelOf(runner);
            return (
              <li
                key={runner.id}
                className="flex h-9 items-stretch overflow-hidden rounded-md border border-race-line bg-race-surface text-sm font-medium shadow-xs"
              >
                <form action={addAction} className="flex">
                  <input type="hidden" name="year" value={year} />
                  <input type="hidden" name="registrationId" value={registrationId ?? 0} />
                  <input type="hidden" name="runnerId" value={runner.id} />
                  <input type="hidden" name="clubId" value={runner.clubId ?? ""} />
                  <input type="hidden" name="clubName" value={runner.clubName ?? clubName} />
                  <QuickAddButton
                    label={label}
                    title={fillCopy(copy.runnerTitle, {
                      name: runner.name,
                      year: runner.id.slice(0, 4),
                    })}
                  />
                </form>
                <button
                  type="button"
                  data-slot="quick-hide"
                  onClick={() => onHide(runner)}
                  aria-label={fillCopy(copy.hide, { name: label })}
                  title={fillCopy(copy.hide, { name: label })}
                  className="flex w-8 items-center justify-center border-l border-race-line text-race-muted transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset dark:hover:bg-accent/50"
                >
                  <XIcon className="size-3.5" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-race-muted">{copy.allHidden}</p>
      )}

      <div role="status" aria-live="polite" className="text-sm">
        {notice ? (
          <p className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-race-muted">
            <span>{fillCopy(copy.hiddenNotice, { name: labelOf(notice) })}</span>
            <Button
              ref={undoRef}
              type="button"
              variant="link"
              size="sm"
              className="h-auto px-0 py-0 has-[>svg]:px-0"
              onClick={onUndo}
            >
              <Undo2Icon className="size-4" aria-hidden="true" />
              {copy.undo}
            </Button>
          </p>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-destructive">
          {copy.error}
        </p>
      ) : null}

      {hidden.length > 0 ? (
        <div className="mt-3">
          <button
            type="button"
            aria-expanded={showHidden}
            aria-controls={QUICK_HIDDEN_LIST_ID}
            onClick={onToggleHidden}
            className="inline-flex items-center gap-1.5 rounded-sm text-sm text-race-muted underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            <EyeOffIcon className="size-4" aria-hidden="true" />
            {fillCopy(copy.hiddenToggle, { count: hidden.length })}
            <span aria-hidden="true">–</span>
            {showHidden ? copy.hiddenCollapse : copy.hiddenShow}
            <ChevronDownIcon
              className={cn("size-4 transition-transform", showHidden && "rotate-180")}
              aria-hidden="true"
            />
          </button>
          {showHidden ? (
            <div id={QUICK_HIDDEN_LIST_ID} className="mt-2">
              <ul className="flex flex-wrap gap-2">
                {hidden.map((runner) => {
                  const label = labelOf(runner);
                  return (
                    <li key={runner.id}>
                      <button
                        type="button"
                        data-slot="quick-restore"
                        onClick={() => onRestore(runner)}
                        aria-label={fillCopy(copy.restore, { name: label })}
                        title={fillCopy(copy.restore, { name: label })}
                        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-dashed border-race-line px-3 text-sm text-race-muted transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:hover:bg-accent/50"
                      >
                        <RotateCcwIcon className="size-3.5" aria-hidden="true" />
                        {label}
                      </button>
                    </li>
                  );
                })}
              </ul>
              {hidden.length > 1 ? (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="mt-2 h-auto px-0 py-0 has-[>svg]:px-0"
                  onClick={onRestoreAll}
                >
                  <RotateCcwIcon className="size-4" aria-hidden="true" />
                  {copy.restoreAll}
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
