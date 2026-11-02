"use client";

import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ArrowLeftRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  filterMergeOptions,
  MERGE_PICK_MIN_QUERY,
  type MergePickOption,
} from "@/lib/admin/merge-pick";
import { cn } from "@/lib/utils";

export type McvvAdminMergePickerCopy = {
  /** „Hlavní klub (zůstane)“. */
  main: string;
  /** „Slučovaný klub (zanikne)“. */
  other: string;
  /** Popisek tlačítka ⇄. */
  swap: string;
  /** Nápověda pod polem („Hledejte podle id nebo názvu“). */
  hint: string;
  noResults: string;
  /** Text bez výběru z nabídky – formulář neodešle. */
  pickFromList: string;
  /** Obě pole mají stejnou položku. */
  same: string;
  /** Odkaz na profil v kartě. */
  profile: string;
};

/**
 * Výběr dvojice ke sloučení (#192, Q245): dvě pole s našeptávačem (podle vzoru
 * `McvvAdminPartnerCombobox`, ARIA combobox), tlačítko ⇄ pro prohození a karta vybrané
 * položky pod každým polem. Formulář dostane jen id ve skrytých polích `mainName` / `otherName`.
 */
export function McvvAdminMergePicker({
  options,
  mainName,
  otherName,
  initialMain = null,
  initialOther = null,
  copy,
  testId = "merge-picker",
}: {
  options: MergePickOption[];
  mainName: string;
  otherName: string;
  initialMain?: string | null;
  initialOther?: string | null;
  copy: McvvAdminMergePickerCopy;
  testId?: string;
}) {
  const byId = useMemo(() => new Map(options.map((o) => [o.id, o])), [options]);
  const [main, setMain] = useState<string | null>(
    initialMain && byId.has(initialMain) ? initialMain : null,
  );
  const [other, setOther] = useState<string | null>(
    initialOther && byId.has(initialOther) ? initialOther : null,
  );
  // Klíč polí: po prohození se pole znovu vykreslí s textem nové volby.
  const [generation, setGeneration] = useState(0);

  const swap = () => {
    setMain(other);
    setOther(main);
    setGeneration((value) => value + 1);
  };

  const same = main != null && main === other;
  return (
    <div className="flex flex-col gap-3" data-testid={testId}>
      <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr] md:items-start">
        <MergePickField
          key={`main-${generation}`}
          label={copy.main}
          name={mainName}
          selected={main ? (byId.get(main) ?? null) : null}
          onSelect={setMain}
          exclude={other}
          options={options}
          copy={copy}
          tone="main"
          testId={`${testId}-main`}
        />
        <Button
          type="button"
          variant="outline"
          onClick={swap}
          disabled={!main && !other}
          aria-label={copy.swap}
          title={copy.swap}
          className="h-9 self-center border-race-line bg-race-surface md:mt-6"
          data-testid={`${testId}-swap`}
        >
          <ArrowLeftRight className="size-4" aria-hidden />
          <span className="md:sr-only">{copy.swap}</span>
        </Button>
        <MergePickField
          key={`other-${generation}`}
          label={copy.other}
          name={otherName}
          selected={other ? (byId.get(other) ?? null) : null}
          onSelect={setOther}
          exclude={main}
          options={options}
          copy={copy}
          tone="other"
          testId={`${testId}-other`}
        />
      </div>
      {same ? (
        <p role="alert" className="text-sm font-semibold text-red-600 dark:text-red-400">
          {copy.same}
        </p>
      ) : null}
    </div>
  );
}

function MergePickField({
  label,
  name,
  selected,
  onSelect,
  exclude,
  options,
  copy,
  tone,
  testId,
}: {
  label: string;
  name: string;
  selected: MergePickOption | null;
  onSelect: (id: string | null) => void;
  exclude: string | null;
  options: readonly MergePickOption[];
  copy: McvvAdminMergePickerCopy;
  tone: "main" | "other";
  testId: string;
}) {
  const [query, setQuery] = useState(selected ? optionText(selected) : "");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const baseId = useId();
  const listId = `${baseId}-list`;
  const hintId = `${baseId}-hint`;
  const results = useMemo(
    () => (selected ? [] : filterMergeOptions(options, query, { exclude })),
    [options, query, exclude, selected],
  );
  const tooShort = query.trim().length < MERGE_PICK_MIN_QUERY;
  const showList = open && !selected && !tooShort;
  const activeIndex = Math.min(active, Math.max(results.length - 1, 0));
  const optionId = (index: number) => `${baseId}-opt-${index}`;

  const choose = (option: MergePickOption) => {
    onSelect(option.id);
    setQuery(optionText(option));
    setOpen(false);
    inputRef.current?.setCustomValidity("");
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      if (!showList) {
        setOpen(true);
        return;
      }
      if (results.length > 0) {
        const step = event.key === "ArrowDown" ? 1 : -1;
        setActive((activeIndex + step + results.length) % results.length);
      }
    } else if (event.key === "Enter") {
      if (showList && results[activeIndex]) {
        event.preventDefault();
        choose(results[activeIndex]);
      }
    } else if (event.key === "Escape" && showList) {
      event.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-1 text-sm">
      <label htmlFor={`${baseId}-input`} className="text-xs font-semibold text-race-dim">
        {label}
      </label>
      <div className="relative">
        <input
          ref={inputRef}
          id={`${baseId}-input`}
          type="text"
          role="combobox"
          aria-expanded={showList}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={showList && results.length > 0 ? optionId(activeIndex) : undefined}
          aria-describedby={hintId}
          autoComplete="off"
          spellCheck={false}
          value={query}
          required
          onChange={(event) => {
            setQuery(event.target.value);
            onSelect(null);
            setActive(0);
            setOpen(true);
            event.target.setCustomValidity(event.target.value.trim() ? copy.pickFromList : "");
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          className="h-9 w-full border border-race-line bg-race-surface px-2 text-sm"
          data-testid={`${testId}-input`}
        />
        <input type="hidden" name={name} value={selected?.id ?? ""} />
        <ul
          id={listId}
          role="listbox"
          aria-label={label}
          hidden={!showList}
          className="absolute inset-x-0 top-full z-50 mt-1 max-h-72 overflow-y-auto border border-race-line bg-race-surface py-1 text-sm shadow-lg"
        >
          {results.length === 0 ? (
            <li role="presentation" className="px-2 py-1.5 text-race-muted">
              {copy.noResults}
            </li>
          ) : (
            results.map((option, index) => (
              <li
                key={option.id}
                id={optionId(index)}
                role="option"
                aria-selected={index === activeIndex}
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(option);
                }}
                onMouseEnter={() => setActive(index)}
                className={cn(
                  "flex cursor-pointer flex-wrap items-baseline gap-x-2 px-2 py-1.5",
                  index === activeIndex && "bg-race-accent/15",
                )}
                data-testid={`${testId}-option`}
              >
                <span className="font-mono text-xs text-race-muted">{option.id}</span>
                <span className="font-semibold">{option.label}</span>
                <span className="text-xs text-race-muted">{option.meta}</span>
              </li>
            ))
          )}
        </ul>
      </div>
      <span id={hintId} className="text-xs text-race-muted">
        {copy.hint}
      </span>
      {selected ? (
        <div
          className={cn(
            "mt-1 border p-3",
            tone === "main"
              ? "border-race-accent/60 bg-race-accent/10"
              : "border-red-500/50 bg-red-500/5",
          )}
          data-testid={`${testId}-card`}
        >
          <p>
            <b className="font-mono">{selected.id}</b> · <b>{selected.card.title}</b>
          </p>
          <ul className="mt-1 text-xs text-race-muted">
            {selected.card.lines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          {selected.card.href ? (
            <a
              href={selected.card.href}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block text-xs font-semibold text-race-accent hover:underline"
            >
              {copy.profile}
            </a>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function optionText(option: MergePickOption): string {
  return `${option.id} – ${option.label}`;
}
