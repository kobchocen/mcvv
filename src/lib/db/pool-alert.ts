/**
 * Recognise an exhausted Prisma connection pool (#199): P2039 from the MariaDB adapter
 * ("pool failed to retrieve a connection from pool", "pool timeout"). Used by
 * `onRequestError` in `src/instrumentation.ts` to print one short, searchable line
 * (`[db] pool exhausted`) for Log Analytics next to the full stack trace Next.js logs.
 */
const POOL_MESSAGE = /pool failed to retrieve a connection|pool timeout|pool connections:/i;

export function isPoolExhaustedError(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  if ("code" in error && error.code === "P2039") return true;
  return (
    "message" in error && typeof error.message === "string" && POOL_MESSAGE.test(error.message)
  );
}

/** "active=5 idle=0 limit=5" from the adapter message, if present. */
function poolState(error: unknown): string | undefined {
  const message =
    typeof error === "object" && error !== null && "message" in error ? String(error.message) : "";
  return /active=\d+ idle=\d+ limit=\d+/.exec(message)?.[0];
}

/** One log line without the query string (it may carry tokens) and without the stack. */
export function poolExhaustedLogLine(
  error: unknown,
  request: { path: string; method: string },
  context: { routePath?: string; routeType?: string },
): string {
  return `[db] pool exhausted (P2039) ${JSON.stringify({
    method: request.method,
    path: request.path.split("?")[0],
    route: context.routePath,
    routeType: context.routeType,
    pool: poolState(error),
  })}`;
}
