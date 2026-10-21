"use client";

import { startTransition, useActionState } from "react";

import { Button } from "@/components/ui/button";
import type { ImportState, ImportView } from "@/lib/raceday/import-view";

export type McvvRacedayImportFormProps = {
  action: (state: ImportState, formData: FormData) => Promise<ImportState>;
  files: { name: string; label: string; hint?: string }[];
  labels: {
    preview: string;
    commit: string;
    confirm: string;
    errors: string;
    warnings: string;
    more: string;
    unchanged: string;
    working: string;
  };
};

function ViewBlock({
  view,
  labels,
}: {
  view: ImportView;
  labels: McvvRacedayImportFormProps["labels"];
}) {
  return (
    <div className="grid gap-5" data-testid="import-preview">
      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
        {view.summary.map((item) => (
          <div
            key={item.label}
            className="flex justify-between gap-4 border-b border-race-line/40 py-1"
          >
            <dt className="text-race-muted">{item.label}</dt>
            <dd className="font-semibold">{item.value}</dd>
          </div>
        ))}
      </dl>
      {view.errors.length > 0 ? (
        <div role="alert" className="text-sm text-red-700 dark:text-red-300">
          <p className="font-semibold">{labels.errors}</p>
          <ul className="mt-1 list-disc pl-5">
            {view.errors.slice(0, 100).map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {view.warnings.length > 0 ? (
        <div role="status" className="text-sm text-amber-700 dark:text-amber-300">
          <p className="font-semibold">{labels.warnings}</p>
          <ul className="mt-1 list-disc pl-5">
            {view.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}
      {view.unchanged && view.errors.length === 0 ? (
        <p className="text-sm text-race-accent">{labels.unchanged}</p>
      ) : null}
      {view.sections.map((block) => (
        <section key={block.title}>
          <h3 className="font-display text-base font-semibold">
            {block.title} ({block.rows.length + block.more})
          </h3>
          <div className="mt-2 max-h-80 overflow-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-race-line text-xs uppercase tracking-wide text-race-dim">
                  {block.header.map((cell) => (
                    <th key={cell} className="py-1 pr-3">
                      {cell}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, index) => (
                  <tr key={index} className="border-b border-race-line/30">
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex} className="py-1 pr-3">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {block.more > 0 ? (
            <p className="mt-1 text-xs text-race-muted">
              {labels.more.replace("{count}", String(block.more))}
            </p>
          ) : null}
        </section>
      ))}
    </div>
  );
}

/**
 * Upload souborů z OBD: „Náhled“ → kontrola rozdílů → „Potvrdit import“.
 * Soubory zůstávají vybrané ve formuláři; potvrzení je pošle znovu i s hashem náhledu,
 * server import zapíše jen tehdy, když se plán nezměnil.
 */
export function McvvRacedayImportForm({ action, files, labels }: McvvRacedayImportFormProps) {
  const [state, formAction, pending] = useActionState(action, { status: "idle" } as ImportState);
  const view = state.status === "idle" ? undefined : state.view;

  return (
    <form
      className="grid gap-5"
      onSubmit={(event) => {
        // Ruční odeslání: <form action> by po akci formulář vynuloval (i vybrané soubory),
        // potvrzení ale musí poslat stejné soubory jako náhled.
        event.preventDefault();
        const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
        if (submitter?.value === "commit" && !window.confirm(labels.confirm)) {
          return;
        }
        const formData = new FormData(event.currentTarget, submitter);
        startTransition(() => formAction(formData));
      }}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        {files.map((file) => (
          <label key={file.name} className="grid gap-1 text-sm">
            <span className="font-medium">{file.label}</span>
            <input
              type="file"
              name={file.name}
              accept=".csv,.txt,text/csv,text/plain"
              className="text-sm file:mr-3 file:border file:border-race-line file:bg-race-surface file:px-3 file:py-1.5"
            />
            {file.hint ? <span className="text-xs text-race-muted">{file.hint}</span> : null}
          </label>
        ))}
      </div>
      {state.status === "preview" ? <input type="hidden" name="hash" value={state.hash} /> : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          name="intent"
          value="preview"
          variant="outline"
          disabled={pending}
          className="h-10 border-race-line bg-race-surface"
        >
          {labels.preview}
        </Button>
        <Button
          type="submit"
          name="intent"
          value="commit"
          disabled={pending || state.status !== "preview" || state.view.unchanged}
          className="h-10 bg-race-accent-solid font-display font-semibold text-white hover:bg-race-accent-solid-hover"
          data-testid="import-commit"
        >
          {labels.commit}
        </Button>
        {pending ? <span className="text-sm text-race-muted">{labels.working}</span> : null}
      </div>
      {state.status === "error" ? (
        <p role="alert" className="text-sm font-semibold text-red-700 dark:text-red-300">
          {state.message}
        </p>
      ) : null}
      {state.status === "done" ? (
        <p
          role="status"
          className="text-sm font-semibold text-race-accent"
          data-testid="import-done"
        >
          {state.message}
        </p>
      ) : null}
      {view ? <ViewBlock view={view} labels={labels} /> : null}
    </form>
  );
}
