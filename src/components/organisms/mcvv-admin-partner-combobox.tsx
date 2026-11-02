"use client";

import {
  createContext,
  useContext,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";

import {
  filterPartnerOptions,
  PARTNER_MIN_QUERY,
  partnerOptionLabel,
  type PartnerOption,
} from "@/lib/race/special-start-input";
import { cn } from "@/lib/utils";

const PartnerOptionsContext = createContext<readonly PartnerOption[]>([]);

/**
 * Nabídka partnerů jednou na stránku (dialogy spec. startu ji sdílejí přes kontext – nabídka
 * se tak neposílá do klienta u každého řádku zvlášť).
 */
export function McvvAdminPartnerOptions({
  options,
  children,
}: {
  options: PartnerOption[];
  children: ReactNode;
}) {
  return (
    <PartnerOptionsContext.Provider value={options}>{children}</PartnerOptionsContext.Provider>
  );
}

export function usePartnerOptions(): readonly PartnerOption[] {
  return useContext(PartnerOptionsContext);
}

export type McvvAdminPartnerComboboxCopy = {
  label: string;
  hint: string;
  /** „Napište aspoň 2 znaky“. */
  minChars: string;
  noResults: string;
  /** „č. {bib}“ – `{bib}` se nahradí číslem. */
  bib: string;
};

/**
 * Našeptávač běžce (Q231) podle vzoru ARIA combobox (seznam s `aria-activedescendant`):
 * nabídka od 2 znaků, šipky nahoru / dolů, Enter vybere, Esc zavře nabídku (a teprve další
 * Esc dialog). Formulář dostane jen id vybraného běžce ve skrytém poli `name`.
 */
export function McvvAdminPartnerCombobox({
  name,
  initialId,
  exclude,
  copy,
  onListOpenChange,
  required = false,
  testId,
}: {
  name: string;
  initialId: string | null;
  /** Běžec, kterému se spec. start nastavuje (sám sebe nevybere). */
  exclude?: string;
  copy: McvvAdminPartnerComboboxCopy;
  onListOpenChange?: (open: boolean) => void;
  required?: boolean;
  testId?: string;
}) {
  const options = usePartnerOptions();
  const byId = useMemo(() => new Map(options.map((o) => [o.runnerId, o])), [options]);
  const initial = initialId ? (byId.get(initialId) ?? null) : null;
  const [selected, setSelected] = useState<PartnerOption | null>(initial);
  const [query, setQuery] = useState(
    initial ? partnerOptionLabel(initial) : initialId ? `[${initialId}]` : "",
  );
  const [open, setOpenState] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const baseId = useId();
  const listId = `${baseId}-list`;
  const hintId = `${baseId}-hint`;
  const results = useMemo(
    () => (selected ? [] : filterPartnerOptions(options, query, { exclude })),
    [options, query, exclude, selected],
  );
  const tooShort = query.trim().length < PARTNER_MIN_QUERY;
  const showList = open && !selected && !tooShort;

  const setOpen = (next: boolean) => {
    setOpenState(next);
    onListOpenChange?.(next && !selected);
  };
  const choose = (option: PartnerOption) => {
    setSelected(option);
    setQuery(partnerOptionLabel(option));
    setOpenState(false);
    onListOpenChange?.(false);
    inputRef.current?.setCustomValidity("");
  };
  const optionId = (index: number) => `${baseId}-opt-${index}`;
  const activeIndex = Math.min(active, Math.max(results.length - 1, 0));

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
    } else if (event.key === "Escape") {
      if (showList) {
        event.preventDefault();
        setOpen(false);
      }
    }
  };

  return (
    <div className="grid gap-1">
      <label htmlFor={`${baseId}-input`} className="font-medium">
        {copy.label}
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
          required={required}
          onChange={(event) => {
            setQuery(event.target.value);
            setSelected(null);
            setActive(0);
            setOpen(true);
            // Text bez výběru z nabídky formulář neodešle (prázdné pole hlídá `required`).
            event.target.setCustomValidity(event.target.value.trim() ? copy.hint : "");
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={onKeyDown}
          className="h-9 w-full border border-race-line bg-race-surface px-2 text-sm"
          data-testid={testId}
        />
        <input type="hidden" name={name} value={selected?.runnerId ?? ""} />
        <ul
          id={listId}
          role="listbox"
          aria-label={copy.label}
          hidden={!showList}
          className="absolute inset-x-0 top-full z-50 mt-1 max-h-64 overflow-y-auto border border-race-line bg-race-surface py-1 text-sm shadow-lg"
        >
          {results.length === 0 ? (
            <li role="presentation" className="px-2 py-1.5 text-race-muted">
              {copy.noResults}
            </li>
          ) : (
            results.map((option, index) => (
              <li
                key={option.runnerId}
                id={optionId(index)}
                role="option"
                aria-selected={index === activeIndex}
                // Výběr myší dřív než blur inputu.
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(option);
                }}
                onMouseEnter={() => setActive(index)}
                className={cn(
                  "flex cursor-pointer flex-wrap items-baseline gap-x-2 px-2 py-1.5",
                  index === activeIndex && "bg-race-accent/15",
                )}
                data-testid="spec-start-partner-option"
              >
                <span className="font-semibold">{option.name}</span>
                <span className="text-race-muted">{option.birthYear}</span>
                <span className="text-race-muted">{option.clubName}</span>
                {option.bib != null ? (
                  <span className="ml-auto font-mono text-xs tabular-nums">
                    {copy.bib.replace("{bib}", String(option.bib))}
                  </span>
                ) : null}
              </li>
            ))
          )}
        </ul>
      </div>
      <span id={hintId} className="text-xs text-race-muted">
        {selected?.bib != null
          ? `${copy.hint} · ${copy.bib.replace("{bib}", String(selected.bib))}`
          : tooShort && !selected
            ? copy.minChars
            : copy.hint}
      </span>
    </div>
  );
}
