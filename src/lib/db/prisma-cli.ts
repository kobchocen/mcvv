import { createRequire } from "node:module";
import type { SpawnSyncReturns } from "node:child_process";

export function prismaCliPath() {
  const require = createRequire(import.meta.url);
  // Prisma's package root exports its programmatic types, not the CLI binary.
  return require.resolve("prisma/build/index.js");
}

export function migrationErrorCode(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    const code = String(error.code);
    if (/^[A-Z][A-Z0-9_]{0,63}$/.test(code)) return code;
  }
  return "UNKNOWN";
}

export function migrationFailure(result: SpawnSyncReturns<string>): string {
  // Only report structured codes, never raw CLI output or connection details.
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const prismaCode = output.match(/\bError(?: code)?:\s*(P\d{4})\b/)?.[1];
  return [
    `exit=${result.status ?? "none"}`,
    `signal=${result.signal ?? "none"}`,
    `code=${result.error ? migrationErrorCode(result.error) : (prismaCode ?? "UNKNOWN")}`,
  ].join(" ");
}
