"use client";

import { useState } from "react";

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
import { saveSpecialStart } from "@/lib/admin/special-start";
import { SPECIAL_START_KINDS, type SpecialStartKind } from "@/lib/race/special-start";
import { cn } from "@/lib/utils";

import { McvvAdminSpecialStartBadge } from "./mcvv-admin-special-start-badge";

export type McvvAdminSpecialStartCopy = {
  /** Tlačítko u běžce bez spec. startu. */
  add: string;
  /** Titulek tlačítka u běžce se spec. startem. */
  edit: string;
  title: string;
  description: string;
  kinds: Record<SpecialStartKind, string>;
  kindHints: Record<SpecialStartKind, string>;
  partner: string;
  partnerHint: string;
  offset: string;
  offsetHint: string;
  note: string;
  noteHint: string;
  save: string;
  clear: string;
  cancel: string;
};

export type McvvAdminSpecialStartValue = {
  kind: SpecialStartKind;
  /** Hodnota pro našeptávač („Jméno · rok · klub [id]“). */
  partnerLabel: string;
  /** Posun ve tvaru pro formulář („+2:00“). */
  offset: string;
  note: string;
};

/**
 * Dialog „Spec. start“ u běžce v administraci přihlášek / startovky (jen pořadatelé).
 * Našeptávač partnera je nativní `<datalist>` s id `partnerListId` (jeden na stránku).
 */
export function McvvAdminSpecialStart({
  year,
  runnerId,
  runnerName,
  registrationId,
  from,
  value,
  partnerListId,
  copy,
  compact = false,
}: {
  year: number;
  runnerId: string;
  runnerName: string;
  registrationId: number;
  from: "detail" | "prehled" | "startovka";
  value: McvvAdminSpecialStartValue | null;
  partnerListId: string;
  copy: McvvAdminSpecialStartCopy;
  /** Na startovce jen odkaz bez odznaku (odznak je ve vlastním sloupci). */
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<SpecialStartKind>(value?.kind ?? "early");
  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setKind(value?.kind ?? "early");
    }
  };
  const fieldClass = "h-9 w-full border border-race-line bg-race-surface px-2 text-sm";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        {value && !compact ? (
          <button
            type="button"
            title={copy.edit}
            data-testid={`spec-start-edit-${runnerId}`}
            className="inline-flex items-center gap-1 text-left hover:opacity-80"
          >
            <McvvAdminSpecialStartBadge label={copy.kinds[value.kind]} />
          </button>
        ) : (
          <button
            type="button"
            data-testid={`spec-start-edit-${runnerId}`}
            className={cn(
              "whitespace-nowrap text-xs underline-offset-2 hover:underline",
              value ? "font-semibold text-race-accent" : "text-race-muted",
            )}
          >
            {value ? copy.edit : copy.add}
          </button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {copy.title}: {runnerName}
          </DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <form action={saveSpecialStart} className="grid gap-4 text-sm">
          <input type="hidden" name="year" value={year} />
          <input type="hidden" name="runnerId" value={runnerId} />
          <input type="hidden" name="registrationId" value={registrationId} />
          <input type="hidden" name="from" value={from} />
          <fieldset className="grid gap-2">
            {SPECIAL_START_KINDS.map((option) => (
              <label key={option} className="flex items-start gap-2">
                <input
                  type="radio"
                  name="kind"
                  value={option}
                  checked={kind === option}
                  onChange={() => setKind(option)}
                  className="mt-1"
                />
                <span>
                  <span className="font-semibold">{copy.kinds[option]}</span>
                  <span className="block text-xs text-race-muted">{copy.kindHints[option]}</span>
                </span>
              </label>
            ))}
          </fieldset>
          {kind === "with" ? (
            <div className="grid gap-3 border-l-2 border-race-accent/40 pl-3">
              <label className="grid gap-1">
                <span className="font-medium">{copy.partner}</span>
                <input
                  name="partner"
                  list={partnerListId}
                  required
                  autoComplete="off"
                  defaultValue={value?.partnerLabel ?? ""}
                  className={fieldClass}
                  data-testid="spec-start-partner"
                />
                <span className="text-xs text-race-muted">{copy.partnerHint}</span>
              </label>
              <label className="grid gap-1">
                <span className="font-medium">{copy.offset}</span>
                <input
                  name="offset"
                  inputMode="text"
                  pattern="\s*[+\-−]?\d{1,2}(:[0-5]\d)?\s*"
                  defaultValue={value?.offset ?? "0"}
                  className={cn(fieldClass, "w-28")}
                  data-testid="spec-start-offset"
                />
                <span className="text-xs text-race-muted">{copy.offsetHint}</span>
              </label>
            </div>
          ) : null}
          <label className="grid gap-1">
            <span className="font-medium">{copy.note}</span>
            <input
              name="note"
              maxLength={200}
              defaultValue={value?.note ?? ""}
              className={fieldClass}
            />
            <span className="text-xs text-race-muted">{copy.noteHint}</span>
          </label>
          <DialogFooter className="flex-wrap gap-2 sm:justify-between">
            {value ? (
              <Button
                type="submit"
                name="clear"
                value="1"
                variant="outline"
                formNoValidate
                className="border-red-600/40 text-red-700 dark:text-red-400"
              >
                {copy.clear}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                {copy.cancel}
              </Button>
              <Button
                type="submit"
                className="bg-race-accent-solid font-display font-semibold text-white hover:bg-race-accent-solid-hover"
                data-testid="spec-start-save"
              >
                {copy.save}
              </Button>
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
