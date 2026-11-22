/**
 * Opakování transakce po souběhu: P2002 (unikátní klíč), P2034 (konflikt / deadlock) a MariaDB 1020
 * „Record has changed since last read … try restarting transaction“ (Prisma ji hlásí jen textem).
 */
import { Prisma } from "@prisma/client";

export function isRetryableTxError(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
  return (
    error.code === "P2002" ||
    error.code === "P2034" ||
    /restarting transaction|deadlock found/i.test(error.message)
  );
}

/** Zavolá `run`, při souběhové chybě to zkusí znovu (krátká náhodná pauza), nejvýš `attempts`×. */
export async function withTxRetry<T>(
  run: () => Promise<T>,
  options: {
    attempts?: number;
    sleep?: (ms: number) => Promise<void>;
    random?: () => number;
  } = {},
): Promise<T> {
  const attempts = options.attempts ?? 6;
  const sleep = options.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const random = options.random ?? Math.random;
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= attempts || !isRetryableTxError(error)) throw error;
      await sleep(10 + Math.round(random() * 40 * attempt));
    }
  }
}
