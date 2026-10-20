"use client";

import { useActionState, useState, useTransition } from "react";

import {
  changeRunnerSex,
  previewRunnerSexChange,
  type SexChangeErrorCode,
  type SexChangePreviewResult,
  type SexChangeState,
} from "@/lib/admin/runner-sex-actions";
import { groupTransitions, yearSpan } from "@/lib/admin/runner-sex-core";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export type McvvAdminSexChangeCopy = {
  trigger: string;
  title: string;
  description: string;
  loading: string;
  ids: string;
  sex: string;
  male: string;
  female: string;
  categories: string;
  line: string;
  lines: string;
  start: string;
  noCategory: string;
  fee: string;
  feeUnchanged: string;
  references: string;
  locked: string;
  cancel: string;
  confirm: string;
  errors: Record<SexChangeErrorCode, string>;
};

/**
 * "Změnit pohlaví" in the admin registration detail: preview + confirmation dialog.
 * Newcomers only – a runner with historical results gets a disabled button with the reason
 * (the server action rejects it as well).
 */
export function McvvAdminSexChange({
  runnerId,
  runnerName,
  year,
  registrationId,
  hasResults,
  copy,
}: {
  runnerId: string;
  runnerName: string;
  year: number;
  registrationId: number;
  hasResults: boolean;
  copy: McvvAdminSexChangeCopy;
}) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<SexChangePreviewResult | null>(null);
  const [loading, startLoading] = useTransition();
  const [state, action, pending] = useActionState<SexChangeState, FormData>(changeRunnerSex, {});

  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setPreview(null);
      startLoading(async () => setPreview(await previewRunnerSexChange(runnerId)));
    }
  };

  const plan = preview?.ok ? preview.plan : null;
  const currentLines = plan?.lines.filter((line) => line.year === year || line.feeChanged) ?? [];
  const pastLines = plan?.lines.filter((line) => !currentLines.includes(line)) ?? [];
  const sexLabel = (sex: "M" | "F") => (sex === "M" ? copy.male : copy.female);
  const error = state.error ?? (preview && !preview.ok ? preview.error : undefined);

  if (hasResults) {
    const hintId = `sex-locked-${runnerId}`;
    return (
      <span className="inline-flex flex-col">
        <button
          type="button"
          disabled
          title={copy.locked}
          aria-describedby={hintId}
          className="cursor-not-allowed whitespace-nowrap text-left text-sm text-race-muted"
        >
          {copy.trigger}
        </button>
        <span id={hintId} className="text-xs text-race-muted">
          {copy.locked}
        </span>
      </span>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="whitespace-nowrap text-sm text-race-accent underline-offset-2 hover:underline"
        >
          {copy.trigger}
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {copy.title}: {runnerName}
          </DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>

        {loading || (!preview && !error) ? (
          <p className="text-sm text-race-muted">{copy.loading}</p>
        ) : null}

        {plan ? (
          <form action={action} className="grid gap-4 text-sm">
            <input type="hidden" name="runnerId" value={plan.oldId} />
            <input type="hidden" name="year" value={year} />
            <input type="hidden" name="registrationId" value={registrationId} />
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5">
              <dt className="text-race-muted">{copy.ids}</dt>
              <dd className="font-mono" data-testid="sex-change-ids">
                {plan.oldId} → <strong>{plan.newId}</strong>
              </dd>
              <dt className="text-race-muted">{copy.sex}</dt>
              <dd>
                {sexLabel(plan.oldSex)} → <strong>{sexLabel(plan.newSex)}</strong>
              </dd>
            </dl>

            {plan.lines.length + plan.starts.length > 0 ? (
              <div>
                <p className="font-semibold">{copy.categories}</p>
                <ul className="mt-1.5 grid gap-1">
                  {currentLines.map((line) => (
                    <li key={`l-${line.year}-${line.registrationId}`}>
                      {copy.line
                        .replace("{year}", String(line.year))
                        .replace("{id}", String(line.registrationId))}
                      : {line.oldCategory.name} →{" "}
                      <strong>{line.newCategory?.name ?? copy.noCategory}</strong>
                      <span
                        className={
                          line.feeChanged
                            ? "ml-1 font-semibold text-race-accent"
                            : "ml-1 text-race-muted"
                        }
                      >
                        · {copy.fee}{" "}
                        {line.feeChanged ? `${line.oldFee} → ${line.newFee} Kč` : copy.feeUnchanged}
                      </span>
                    </li>
                  ))}
                  {[
                    ...groupTransitions(pastLines).map((group) => ({ group, label: copy.lines })),
                    ...groupTransitions(plan.starts).map((group) => ({ group, label: copy.start })),
                  ].map(({ group, label }) => (
                    <li key={`${label}-${group.toYear}`}>
                      {label.replace("{years}", yearSpan(group))}
                      {group.count > 1 ? ` (${group.count}×)` : ""}: {group.from} →{" "}
                      <strong>{group.to ?? copy.noCategory}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <p className="text-race-muted">
              {copy.references
                .replace("{photos}", String(plan.photos))
                .replace("{lines}", String(plan.lines.length))
                .replace("{starts}", String(plan.starts.length))}
            </p>

            {state.error ? (
              <p role="alert" className="text-red-600 dark:text-red-400">
                {copy.errors[state.error]}
              </p>
            ) : null}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {copy.cancel}
              </Button>
              <Button
                type="submit"
                disabled={pending}
                className="bg-race-accent-solid font-display font-semibold text-white hover:bg-race-accent-solid-hover"
              >
                {copy.confirm.replace("{id}", plan.newId)}
              </Button>
            </DialogFooter>
          </form>
        ) : error ? (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {copy.errors[error]}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
