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
import {
  formatOffset,
  MAX_OFFSET_SECONDS,
  parseOffset,
  SPECIAL_START_KINDS,
  type SpecialStartKind,
} from "@/lib/race/special-start";
import { cn } from "@/lib/utils";

import {
  McvvAdminPartnerCombobox,
  type McvvAdminPartnerComboboxCopy,
} from "./mcvv-admin-partner-combobox";
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
  partner: McvvAdminPartnerComboboxCopy;
  offset: string;
  offsetHint: string;
  /** „Dřív o {interval} s“ / „Později o {interval} s“ (tlačítka ±). */
  offsetEarlier: string;
  offsetLater: string;
  /** „= {steps} × {interval} s“. */
  offsetSteps: string;
  offsetSame: string;
  offsetErrFormat: string;
  offsetErrStep: string;
  offsetErrRange: string;
  note: string;
  noteHint: string;
  save: string;
  clear: string;
  cancel: string;
};

export type McvvAdminSpecialStartValue = {
  kind: SpecialStartKind;
  /** Jen u „spolu s“. */
  partnerId: string | null;
  /** Posun ve tvaru pro formulář („+2:00“). */
  offset: string;
  note: string;
};

function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));
}

/**
 * Dialog „Spec. start“ u běžce v administraci přihlášek (jen pořadatelé; Q229 – jinde se
 * spec. start nenastavuje). Nabídku partnerů dává `McvvAdminPartnerOptions` na stránce.
 * Posun „spolu s“ je `m:ss` nebo kroky ± interval; musí být násobkem intervalu (Q235).
 */
export function McvvAdminSpecialStart({
  year,
  runnerId,
  runnerName,
  registrationId,
  from,
  value,
  intervalSeconds,
  copy,
}: {
  year: number;
  runnerId: string;
  runnerName: string;
  registrationId: number;
  from: "detail" | "prehled";
  value: McvvAdminSpecialStartValue | null;
  intervalSeconds: number;
  copy: McvvAdminSpecialStartCopy;
}) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<SpecialStartKind>(value?.kind ?? "early");
  const [offset, setOffset] = useState(value?.offset ?? "0");
  const [listOpen, setListOpen] = useState(false);
  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setKind(value?.kind ?? "early");
      setOffset(value?.offset ?? "0");
      setListOpen(false);
    }
  };
  const parsed = parseOffset(offset, intervalSeconds);
  const offsetError = parsed.ok
    ? null
    : parsed.reason === "step"
      ? fill(copy.offsetErrStep, { interval: intervalSeconds })
      : parsed.reason === "range"
        ? copy.offsetErrRange
        : copy.offsetErrFormat;
  const step = (direction: 1 | -1) => {
    const base = parsed.ok ? parsed.seconds : 0;
    // Nejdřív zarovnat na interval, pak o jeden krok.
    const aligned = Math.round(base / intervalSeconds) * intervalSeconds;
    const next = Math.max(
      -MAX_OFFSET_SECONDS,
      Math.min(MAX_OFFSET_SECONDS, aligned + direction * intervalSeconds),
    );
    setOffset(formatOffset(next).replace("\u2212", "-"));
  };
  const fieldClass = "h-9 w-full border border-race-line bg-race-surface px-2 text-sm";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        {value ? (
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
            className="whitespace-nowrap text-xs text-race-muted underline-offset-2 hover:underline"
          >
            {copy.add}
          </button>
        )}
      </DialogTrigger>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-lg"
        // Esc s otevřenou nabídkou zavře jen nabídku.
        onEscapeKeyDown={(event) => {
          if (listOpen) {
            event.preventDefault();
          }
        }}
      >
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
              <McvvAdminPartnerCombobox
                name="partner"
                initialId={value?.partnerId ?? null}
                exclude={runnerId}
                copy={copy.partner}
                onListOpenChange={setListOpen}
                required
                testId="spec-start-partner"
              />
              <div className="grid gap-1">
                <label htmlFor={`spec-offset-${runnerId}`} className="font-medium">
                  {copy.offset}
                </label>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={fill(copy.offsetEarlier, { interval: intervalSeconds })}
                    title={fill(copy.offsetEarlier, { interval: intervalSeconds })}
                    onClick={() => step(-1)}
                    data-testid="spec-start-offset-minus"
                  >
                    −{intervalSeconds} s
                  </Button>
                  <input
                    id={`spec-offset-${runnerId}`}
                    name="offset"
                    inputMode="text"
                    value={offset}
                    onChange={(event) => setOffset(event.target.value)}
                    aria-invalid={offsetError ? true : undefined}
                    aria-describedby={`spec-offset-${runnerId}-hint`}
                    className={cn(fieldClass, "w-24 text-center font-mono")}
                    data-testid="spec-start-offset"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    aria-label={fill(copy.offsetLater, { interval: intervalSeconds })}
                    title={fill(copy.offsetLater, { interval: intervalSeconds })}
                    onClick={() => step(1)}
                    data-testid="spec-start-offset-plus"
                  >
                    +{intervalSeconds} s
                  </Button>
                  <span className="text-xs tabular-nums text-race-muted" aria-live="polite">
                    {parsed.ok
                      ? parsed.seconds === 0
                        ? copy.offsetSame
                        : fill(copy.offsetSteps, {
                            steps: `${parsed.seconds > 0 ? "+" : "\u2212"}${Math.abs(parsed.seconds / intervalSeconds)}`,
                            interval: intervalSeconds,
                          })
                      : null}
                  </span>
                </div>
                <span
                  id={`spec-offset-${runnerId}-hint`}
                  className={cn(
                    "text-xs",
                    offsetError
                      ? "font-semibold text-red-700 dark:text-red-400"
                      : "text-race-muted",
                  )}
                >
                  {offsetError ?? fill(copy.offsetHint, { interval: intervalSeconds })}
                </span>
              </div>
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
                disabled={kind === "with" && offsetError != null}
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
