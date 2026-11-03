"use client";

import { useState } from "react";

import { ConfirmSubmitButton } from "@/components/molecules/confirm-dialog";
import { Link } from "@/i18n/routing";
import { confirmRunnerOrphanCleanup } from "@/lib/admin/runner-orphan-actions";

export type McvvAdminRunnerOrphanItem = {
  id: string;
  name: string;
  birthYear: number;
  nationality: string | null;
  /** Založeno (už naformátované) a kdo. */
  created: string;
};

export type McvvAdminRunnerOrphansCopy = {
  colSelect: string;
  colName: string;
  colId: string;
  colBirthYear: string;
  colNationality: string;
  colCreated: string;
  selectAll: string;
  selectNone: string;
  selected: string;
  execute: string;
  confirmTitle: string;
  confirmText: string;
  confirmLabel: string;
};

/**
 * Hromadné smazání běžců bez dat: seznam se zaškrtnutím (výchozí vše), počet vybraných a
 * potvrzovací dialog. Server výběr znovu ověří v transakci (`confirmRunnerOrphanCleanup`).
 * Texty s `{count}` doplní komponenta.
 */
export function McvvAdminRunnerOrphans({
  rows,
  copy,
}: {
  rows: McvvAdminRunnerOrphanItem[];
  copy: McvvAdminRunnerOrphansCopy;
}) {
  const [checked, setChecked] = useState<Set<string>>(() => new Set(rows.map((row) => row.id)));
  const count = checked.size;
  const fill = (text: string) => text.replaceAll("{count}", String(count));
  const toggle = (id: string, on: boolean) =>
    setChecked((current) => {
      const next = new Set(current);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <form action={confirmRunnerOrphanCleanup} className="mt-4" data-testid="runner-orphans-form">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <button
          type="button"
          className="font-semibold text-race-accent hover:underline"
          onClick={() => setChecked(new Set(rows.map((row) => row.id)))}
        >
          {copy.selectAll}
        </button>
        <button
          type="button"
          className="font-semibold text-race-accent hover:underline"
          onClick={() => setChecked(new Set())}
        >
          {copy.selectNone}
        </button>
        <span className="text-race-muted" data-testid="runner-orphans-selected">
          {fill(copy.selected)}
        </span>
      </div>
      <div className="mt-3 max-h-[32rem] overflow-auto border border-race-line/55">
        <table className="w-full border-collapse text-left text-sm">
          <thead className="sticky top-0 bg-race-surface">
            <tr className="border-b border-race-line text-xs font-semibold uppercase tracking-wide text-race-dim">
              <th className="w-10 px-2 py-2">
                <span className="sr-only">{copy.colSelect}</span>
              </th>
              <th className="px-2 py-2">{copy.colName}</th>
              <th className="px-2 py-2">{copy.colId}</th>
              <th className="px-2 py-2">{copy.colBirthYear}</th>
              <th className="px-2 py-2">{copy.colNationality}</th>
              <th className="px-2 py-2">{copy.colCreated}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-race-line/40">
                <td className="px-2 py-1.5">
                  <input
                    type="checkbox"
                    name="id"
                    value={row.id}
                    checked={checked.has(row.id)}
                    onChange={(event) => toggle(row.id, event.target.checked)}
                    aria-label={`${copy.colSelect}: ${row.name} (${row.id})`}
                    className="size-4"
                  />
                </td>
                <td className="px-2 py-1.5">
                  <Link
                    href={{ pathname: "/admin/ciselniky/bezci/[id]", params: { id: row.id } }}
                    className="text-race-accent hover:underline"
                  >
                    {row.name}
                  </Link>
                </td>
                <td className="px-2 py-1.5 font-mono">{row.id}</td>
                <td className="px-2 py-1.5 tabular-nums">{row.birthYear}</td>
                <td className="px-2 py-1.5">{row.nationality ?? "—"}</td>
                <td className="px-2 py-1.5 text-race-muted">{row.created}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4">
        <ConfirmSubmitButton
          destructive
          variant="destructive"
          name="nevratne"
          value="ano"
          disabled={count === 0}
          title={copy.confirmTitle}
          description={fill(copy.confirmText)}
          confirmLabel={fill(copy.confirmLabel)}
          data-testid="runner-orphans-execute"
        >
          {fill(copy.execute)}
        </ConfirmSubmitButton>
      </div>
    </form>
  );
}
