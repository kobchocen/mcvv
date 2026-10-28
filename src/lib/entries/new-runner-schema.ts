import { z } from "zod";

import { isCountryCode } from "@/lib/runner/nationality";

/**
 * Server-side validation of the "new runner" entry form. Sex has no default: the runner id
 * encodes it (5th digit 0 = male, 5 = female), so a missing choice must be rejected rather
 * than silently stored as male (#103).
 */
export const newRunnerSchema = z.object({
  year: z.coerce.number().int().min(1993).max(2100),
  registrationId: z.coerce.number().int().min(0),
  firstName: z.string().trim().min(1).max(50),
  lastName: z.string().trim().min(1).max(50),
  birthYear: z.coerce.number().int().min(1900).max(2100),
  sex: z.enum(["M", "F"]),
  categoryId: z.string().trim().length(1),
  clubName: z.string().trim().optional().default(""),
  /** Státní příslušnost (#200): ISO kód, prázdné = neuvedeno, neznámý kód = chyba. */
  nationality: z
    .string()
    .trim()
    .toUpperCase()
    .optional()
    .default("")
    .refine((value) => value === "" || isCountryCode(value)),
});

export type NewRunnerInput = z.infer<typeof newRunnerSchema>;

export type NewRunnerParse =
  { ok: true; data: NewRunnerInput } | { ok: false; error: "sex" | "invalid" };

export function parseNewRunner(raw: Record<string, unknown>): NewRunnerParse {
  const result = newRunnerSchema.safeParse(raw);
  if (result.success) {
    return { ok: true, data: result.data };
  }
  const sexIssue = result.error.issues.some((issue) => issue.path[0] === "sex");
  return { ok: false, error: sexIssue ? "sex" : "invalid" };
}

export function formDataRecord(formData: FormData): Record<string, string> {
  const record: Record<string, string> = {};
  for (const key of Object.keys(newRunnerSchema.shape)) {
    const value = formData.get(key);
    if (typeof value === "string") {
      record[key] = value;
    }
  }
  return record;
}
