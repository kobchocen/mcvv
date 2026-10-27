/**
 * In-process concurrency limit for DB work of one feature (#199).
 *
 * The Prisma pool has 5 connections (`options.ts`). A burst of requests to one expensive page
 * (crawler on /bezec/[id]) took all of them and the rest of the site failed with P2039
 * (pool timeout). Work wrapped in a limiter waits in memory instead, so the page can use at
 * most `max` connections and the remaining ones stay free for other pages.
 */
export type Limiter = <T>(task: () => Promise<T>) => Promise<T>;

export function createLimiter(max: number): Limiter {
  if (!Number.isInteger(max) || max < 1) throw new Error("Limiter needs max >= 1");
  let active = 0;
  const waiting: (() => void)[] = [];
  // A finished task hands its slot straight to the next waiting one, so a newcomer
  // cannot slip in between and exceed `max`.
  const release = () => {
    const next = waiting.shift();
    if (next) next();
    else active -= 1;
  };
  return async <T>(task: () => Promise<T>): Promise<T> => {
    if (active >= max) await new Promise<void>((resolve) => waiting.push(resolve));
    else active += 1;
    try {
      return await task();
    } finally {
      release();
    }
  };
}
