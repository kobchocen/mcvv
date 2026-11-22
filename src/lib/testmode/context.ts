import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Testovací kontext (B+, návrh §2 pojistka 1): nastaví se jen v interních routách dne závodu,
 * když běží test. Všechno, co v něm běží, zapisuje jen do stínového ročníku a testovacích
 * tabulek (zápisová brána v `db/client.ts`) a neposílá poštu (`mail/queue.ts`).
 */
export type TestContext = {
  runId: number;
  /** Stínový ročník (9026). */
  year: number;
  /** Po konci testu (T+3h) jsou zápisy zamčené. */
  readOnly: boolean;
};

declare global {
  var mcvvTestContext: AsyncLocalStorage<TestContext> | undefined;
}

// Jedna instance pro všechny kopie modulu (Next.js může modul načíst víckrát).
const storage = (globalThis.mcvvTestContext ??= new AsyncLocalStorage<TestContext>());

export function currentTestContext(): TestContext | null {
  return storage.getStore() ?? null;
}

/** Spustí `fn` v testovacím kontextu (testovací dohláška, plánovač, unit testy). */
export function runInTestContext<T>(ctx: TestContext, fn: () => T): T {
  return storage.run(ctx, fn);
}

/**
 * Zbytek aktuálního požadavku poběží v testovacím kontextu (volá `getLiveRaceContext`, když
 * je aktivní test). Platí jen pro tento asynchronní řetězec, ne pro jiné požadavky.
 */
export function enterTestContext(ctx: TestContext): void {
  storage.enterWith(ctx);
}

export class TestWriteBlockedError extends Error {
  constructor(readonly reason: string) {
    super(`Testovací režim: zápis zablokován (${reason})`);
    this.name = "TestWriteBlockedError";
  }
}
