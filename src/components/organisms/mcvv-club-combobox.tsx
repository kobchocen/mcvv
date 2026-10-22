"use client";

import { cn } from "@/lib/utils";

/**
 * Pole klubu s našeptáváním z číselníku (Q35). Nabídku (`McvvClubDatalist`) vykresluje
 * stránka jednou a pole na ni odkazuje přes `listId`. Server podle vybraného textu dohledá
 * id klubu, nový název založí nový klub.
 */
export function McvvClubCombobox({
  name = "clubName",
  defaultValue,
  value,
  onChange,
  required = false,
  listId,
  id,
  className,
  onBlurSubmit,
}: {
  name?: string;
  defaultValue?: string;
  value?: string;
  onChange?: (value: string) => void;
  required?: boolean;
  listId: string;
  id?: string;
  className?: string;
  onBlurSubmit?: boolean;
}) {
  const controlled = value !== undefined;
  return (
    <input
      id={id}
      name={controlled ? undefined : name}
      list={listId}
      value={controlled ? value : undefined}
      defaultValue={controlled ? undefined : defaultValue}
      required={required}
      autoComplete="off"
      onChange={(event) => onChange?.(event.currentTarget.value)}
      onBlur={(event) => {
        if (!onBlurSubmit) {
          return;
        }
        const next = event.currentTarget.value.trim();
        const initial = (controlled ? value : defaultValue)?.trim() ?? "";
        if (next === initial) {
          return;
        }
        event.currentTarget.form?.requestSubmit();
      }}
      className={cn(
        "h-9 w-full min-w-[10rem] border border-race-line bg-race-surface px-2 text-sm",
        className,
      )}
    />
  );
}
