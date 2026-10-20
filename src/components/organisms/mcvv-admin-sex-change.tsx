"use client";

import { useActionState, useState, useTransition } from "react";

import {
  changeRunnerSex,
  previewRunnerSexChange,
  type SexChangePreviewResult,
  type SexChangeState,
} from "@/lib/admin/runner-sex-actions";
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
  start: string;
  noCategory: string;
  fee: string;
  feeUnchanged: string;
  references: string;
  results: string;
  recategorize: string;
  recategorizeHint: string;
  cancel: string;
  confirm: string;
  errors: Record<"not_found" | "invalid_id" | "collision" | "failed", string>;
};

/** "Změnit pohlaví" in the admin registration detail: preview + confirmation dialog. */
export function McvvAdminSexChange({
  runnerId,
  runnerName,
  year,
  registrationId,
  copy,
}: {
  runnerId: string;
  runnerName: string;
  year: number;
  registrationId: number;
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
  const sexLabel = (sex: "M" | "F") => (sex === "M" ? copy.male : copy.female);
  const error = state.error ?? (preview && !preview.ok ? preview.error : undefined);

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
                  {plan.lines.map((line) => (
                    <li key={`l-${line.year}-${line.registrationId}`}>
                      {copy.line
                        .replace("{year}", String(line.year))
                        .replace("{id}", String(line.registrationId))}
                      : {line.oldCategory.name} →{" "}
                      <strong>{line.newCategory?.name ?? copy.noCategory}</strong>
                      {line.year === year || line.feeChanged ? (
                        <span
                          className={
                            line.feeChanged
                              ? "ml-1 font-semibold text-race-accent"
                              : "ml-1 text-race-muted"
                          }
                        >
                          · {copy.fee}{" "}
                          {line.feeChanged
                            ? `${line.oldFee} → ${line.newFee} Kč`
                            : copy.feeUnchanged}
                        </span>
                      ) : null}
                    </li>
                  ))}
                  {plan.starts.map((start) => (
                    <li key={`s-${start.year}`}>
                      {copy.start.replace("{year}", String(start.year))}: {start.oldCategory.name} →{" "}
                      <strong>{start.newCategory?.name ?? copy.noCategory}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <p className="text-race-muted">
              {copy.references
                .replace("{results}", String(plan.results.length))
                .replace("{photos}", String(plan.photos))
                .replace("{lines}", String(plan.lines.length))
                .replace("{starts}", String(plan.starts.length))}
            </p>

            {plan.results.length > 0 ? (
              <label className="flex items-start gap-3">
                <input type="checkbox" name="recategorizeResults" className="mt-0.5 size-4" />
                <span>
                  <span className="font-medium">
                    {copy.recategorize.replace("{count}", String(plan.results.length))}
                  </span>
                  <span className="mt-0.5 block text-race-muted">
                    {copy.results}{" "}
                    {plan.results
                      .map(
                        (row) =>
                          `${row.year} ${row.oldCategory.name} → ${row.newCategory?.name ?? copy.noCategory}`,
                      )
                      .join(", ")}
                    . {copy.recategorizeHint}
                  </span>
                </span>
              </label>
            ) : null}

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
