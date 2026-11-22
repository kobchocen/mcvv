import { currentTestContext } from "@/lib/testmode/context";

/**
 * Blok pošty v testovacím režimu (B+, návrh §2 pojistka 3): v testovacím kontextu se žádný
 * e-mail nezařadí do fronty ani neodešle, nezávisle na `MAIL_DRY_RUN`. Jen záznam do logu.
 */
export function mailBlockedInTest(kind: string): boolean {
  const ctx = currentTestContext();
  if (!ctx) return false;
  console.warn("[testmode] mail blocked", { kind, testRun: ctx.runId });
  return true;
}
