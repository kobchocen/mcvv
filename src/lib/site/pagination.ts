/** Paging of server-rendered public lists (club list, club runners). Pure. */

export type PageSlice<T> = {
  items: T[];
  page: number;
  pageCount: number;
  total: number;
  /** 1-based index of the first and last item shown (0 when empty). */
  from: number;
  to: number;
};

/** One page of a list; an invalid or too large page number falls back to the nearest page. */
export function paginate<T>(items: readonly T[], pageRaw: unknown, perPage: number): PageSlice<T> {
  const total = items.length;
  const pageCount = Math.max(1, Math.ceil(total / perPage));
  const parsed = typeof pageRaw === "string" ? Number.parseInt(pageRaw, 10) : Number(pageRaw);
  const page = Number.isFinite(parsed) ? Math.min(Math.max(1, Math.trunc(parsed)), pageCount) : 1;
  const start = (page - 1) * perPage;
  const slice = items.slice(start, start + perPage);
  return {
    items: slice,
    page,
    pageCount,
    total,
    from: slice.length ? start + 1 : 0,
    to: start + slice.length,
  };
}

/** Pages shown around the current one: first, last and two neighbours; gaps become "…". */
export function paginationWindow(page: number, pageCount: number): (number | "gap")[] {
  const pages = new Set([1, pageCount, page - 1, page, page + 1]);
  const list = [...pages].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b);
  return list.flatMap((p, index) => (index > 0 && p - list[index - 1] > 1 ? ["gap", p] : [p])) as (
    number | "gap"
  )[];
}
