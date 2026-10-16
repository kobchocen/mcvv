"use client";

import { useEffect, useId, useRef, useState } from "react";

import { useRouter } from "@/i18n/routing";

type Suggestion = {
  id: string;
  name: string;
  born: string;
};

export type RunnerSearchProps = {
  placeholder: string;
  emptyLabel: string;
};

export function RunnerSearch({ placeholder, emptyLabel }: RunnerSearchProps) {
  const router = useRouter();
  const listId = useId();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [searched, setSearched] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const trimmed = query.trim();
  const canSearch = trimmed.length >= 2;

  useEffect(() => {
    if (!canSearch) {
      return;
    }

    const handle = window.setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const response = await fetch(`/api/bezci?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        if (!response.ok) {
          return;
        }
        const data = (await response.json()) as Suggestion[];
        setItems(data);
        setSearched(true);
        setOpen(true);
        setActive(0);
      } catch (error) {
        if ((error as { name?: string }).name !== "AbortError") {
          setItems([]);
        }
      }
    }, 200);

    return () => window.clearTimeout(handle);
  }, [canSearch, trimmed]);

  const go = (id: string) => {
    setOpen(false);
    router.push({ pathname: "/bezec/[id]", params: { id } } as never);
  };

  const showList = open && canSearch;

  return (
    <div className="relative">
      <input
        type="search"
        role="combobox"
        value={query}
        onChange={(event) => {
          const value = event.target.value;
          setQuery(value);
          if (value.trim().length < 2) {
            abortRef.current?.abort();
            setItems([]);
            setSearched(false);
            setOpen(false);
          }
        }}
        onFocus={() => {
          if (canSearch) {
            setOpen(true);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setActive((index) => Math.min(index + 1, Math.max(items.length - 1, 0)));
            setOpen(true);
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            setActive((index) => Math.max(index - 1, 0));
          } else if (event.key === "Enter") {
            event.preventDefault();
            const pick = items[active] ?? items[0];
            if (pick) {
              go(pick.id);
            }
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder={placeholder}
        autoComplete="off"
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={showList}
        className="h-12 w-full border border-race-line/55 bg-race-surface px-4 text-sm text-foreground outline-none placeholder:text-race-dim focus:border-race-accent"
      />
      {showList ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-40 mt-1 max-h-72 w-full overflow-auto border border-race-line/55 bg-race-surface shadow-lg"
        >
          {items.length === 0 && searched ? (
            <li className="px-4 py-3 text-sm text-race-muted">{emptyLabel}</li>
          ) : (
            items.map((item, index) => (
              <li key={item.id} role="option" aria-selected={index === active}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(index)}
                  onClick={() => go(item.id)}
                  className={`flex w-full items-baseline justify-between gap-3 px-4 py-2.5 text-left text-sm ${
                    index === active ? "bg-race-accent/10" : ""
                  }`}
                >
                  <span className="font-semibold text-foreground">{item.name}</span>
                  <span className="text-xs text-race-dim">* {item.born}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
