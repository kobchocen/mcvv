"use client";

import { useEffect, useId, useRef, useState } from "react";

import { CountryFlag } from "@/components/atoms/country-flag";
import { Input } from "@/components/ui/input";
import { useRouter } from "@/i18n/routing";
import type { RunnerSuggestion } from "@/lib/admin/runner-directory";
import { cn } from "@/lib/utils";

export type McvvAdminRunnerSearchCopy = {
  placeholder: string;
  /** Žádný návrh. */
  noResults: string;
  /** „naposledy“ – před posledním ročníkem závodu. */
  lastYear: string;
  /** Nápověda pod polem (klávesy, ročník narození). */
  hint: string;
};

const MIN_QUERY = 2;

/**
 * Pole hledání v číselníku běžců s našeptávačem (ARIA combobox, podle vzoru veřejného
 * `RunnerSearch`). Píšete → návrhy (jméno, ročník narození, klub, stát); šipky + Enter nebo
 * klik otevře detail běžce. Enter bez vybraného návrhu odešle formulář = plné hledání.
 */
export function McvvAdminRunnerSearch({
  id,
  name = "q",
  defaultValue = "",
  copy,
}: {
  id: string;
  name?: string;
  defaultValue?: string;
  copy: McvvAdminRunnerSearchCopy;
}) {
  const router = useRouter();
  const listId = useId();
  const hintId = `${listId}-hint`;
  const [query, setQuery] = useState(defaultValue);
  const [items, setItems] = useState<RunnerSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  // -1 = žádný návrh vybraný šipkami (Enter pak odešle formulář).
  const [active, setActive] = useState(-1);
  const [searched, setSearched] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const skipFirst = useRef(defaultValue.trim().length >= MIN_QUERY);
  const trimmed = query.trim();
  const canSearch = trimmed.length >= MIN_QUERY;

  useEffect(() => {
    if (!canSearch) {
      return;
    }
    // Po odeslání hledání (stránka s ?q=) návrhy hned neotvírat – výsledky jsou pod polem.
    if (skipFirst.current) {
      skipFirst.current = false;
      return;
    }
    const handle = window.setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const response = await fetch(`/api/admin/bezci?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          return;
        }
        setItems((await response.json()) as RunnerSuggestion[]);
        setSearched(true);
        setOpen(true);
        setActive(-1);
      } catch (error) {
        if ((error as { name?: string }).name !== "AbortError") {
          setItems([]);
        }
      }
    }, 200);
    return () => window.clearTimeout(handle);
  }, [canSearch, trimmed]);

  const go = (runnerId: string) => {
    setOpen(false);
    router.push({ pathname: "/admin/ciselniky/bezci/[id]", params: { id: runnerId } });
  };

  const showList = open && canSearch && searched;

  return (
    <div className="relative w-[28rem] max-w-full">
      <Input
        id={id}
        name={name}
        type="search"
        role="combobox"
        value={query}
        onChange={(event) => {
          const value = event.target.value;
          setQuery(value);
          if (value.trim().length < MIN_QUERY) {
            abortRef.current?.abort();
            setItems([]);
            setSearched(false);
            setOpen(false);
          }
        }}
        onFocus={() => {
          if (canSearch && searched) {
            setOpen(true);
          }
        }}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
            setActive((index) => Math.min(index + 1, items.length - 1));
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((index) => Math.max(index - 1, -1));
          } else if (event.key === "Enter" && showList && items[active]) {
            event.preventDefault();
            go(items[active].id);
          } else if (event.key === "Escape") {
            setOpen(false);
            setActive(-1);
          }
        }}
        placeholder={copy.placeholder}
        autoComplete="off"
        autoFocus
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={showList}
        aria-activedescendant={showList && items[active] ? `${listId}-${active}` : undefined}
        aria-describedby={hintId}
        className="h-10 w-full bg-race-surface"
        data-testid="runner-search-input"
      />
      <p id={hintId} className="mt-1 text-xs text-race-muted">
        {copy.hint}
      </p>
      {showList ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-40 mt-1 max-h-80 w-full overflow-auto border border-race-line/55 bg-race-surface shadow-lg"
          data-testid="runner-suggestions"
        >
          {items.length === 0 ? (
            <li className="px-3 py-2.5 text-sm text-race-muted">{copy.noResults}</li>
          ) : (
            items.map((item, index) => (
              <li
                key={item.id}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
              >
                <button
                  type="button"
                  tabIndex={-1}
                  onMouseEnter={() => setActive(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => go(item.id)}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-left text-sm",
                    index === active && "bg-race-accent/10",
                  )}
                >
                  <CountryFlag code={item.nationality} className="h-3" />
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold text-foreground">{item.name}</span>
                    <span className="ml-2 text-xs text-race-dim">* {item.born}</span>
                    {item.club || item.lastYear ? (
                      <span className="block truncate text-xs text-race-muted">
                        {[item.club, item.lastYear ? `${copy.lastYear} ${item.lastYear}` : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    ) : null}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
