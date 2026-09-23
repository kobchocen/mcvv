import { z } from "zod";

const emptyToUndefined = z
  .string()
  .optional()
  .transform((value) => (value && value.length > 0 ? value : undefined));

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required")
    .url("DATABASE_URL must be a valid URL")
    .optional(),
  DATABASE_TLS: z.enum(["true", "false"]).optional(),
  DATABASE_SSL_CA: z.string().min(1).optional(),
  SHADOW_DATABASE_URL: z.string().url("SHADOW_DATABASE_URL must be a valid URL").optional(),
  TIME_ZONE: z.string().min(1, "TIME_ZONE cannot be empty").default("Europe/Prague"),
  CONTACT_TO: z.string().email().default("mcvv@mcvv.org"),
  SMTP_HOST: emptyToUndefined,
  SMTP_PORT: z.number().int().positive().optional(),
  SMTP_USER: emptyToUndefined,
  SMTP_PASS: emptyToUndefined,
  SMTP_FROM: emptyToUndefined,
  SESSION_SECRET: emptyToUndefined,
  ADMIN_EMAIL: emptyToUndefined,
  ADMIN_PASSWORD: emptyToUndefined,
  ADMIN_NAME: emptyToUndefined,
  ORGANIZER_EMAIL: emptyToUndefined,
  ORGANIZER_PASSWORD: emptyToUndefined,
  ORGANIZER_NAME: emptyToUndefined,
});

const parsedEnv = envSchema.safeParse({
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL,
  DATABASE_TLS: process.env.DATABASE_TLS,
  DATABASE_SSL_CA: process.env.DATABASE_SSL_CA,
  SHADOW_DATABASE_URL: process.env.SHADOW_DATABASE_URL,
  TIME_ZONE: process.env.TIME_ZONE,
  CONTACT_TO: process.env.CONTACT_TO,
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined,
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  SMTP_FROM: process.env.SMTP_FROM,
  SESSION_SECRET: process.env.SESSION_SECRET,
  ADMIN_EMAIL: process.env.ADMIN_EMAIL,
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
  ADMIN_NAME: process.env.ADMIN_NAME,
  ORGANIZER_EMAIL: process.env.ORGANIZER_EMAIL,
  ORGANIZER_PASSWORD: process.env.ORGANIZER_PASSWORD,
  ORGANIZER_NAME: process.env.ORGANIZER_NAME,
});

if (!parsedEnv.success) {
  console.error("Invalid environment variables:", parsedEnv.error.flatten().fieldErrors);
  throw new Error("Invalid environment variables");
}

export const env = parsedEnv.data;

// Delivery tooling imports the same boundary instead of reading process.env itself.
export function processEnvironment(overrides: Record<string, string | undefined> = {}) {
  return { ...process.env, ...overrides };
}

export function releaseEnvironment() {
  const result = z
    .object({
      GITHUB_ACTIONS: z.literal("true"),
      GITHUB_REPOSITORY: z.literal("kobchocen/mcvv"),
      GITHUB_REF_NAME: z.string().min(1),
      GITHUB_SHA: z.string().regex(/^[a-f0-9]{40}$/),
      GITHUB_RUN_NUMBER: z.string().regex(/^[1-9]\d*$/),
      GITHUB_RUN_ATTEMPT: z.string().regex(/^[1-9]\d*$/),
      ACR_NAME: z.string().regex(/^[a-z0-9]{3,50}$/),
      INFRA_REPOSITORY: z.string().regex(/^[\w.-]+\/[\w.-]+$/),
      INFRA_BUILD_REF: z.string().regex(/^[a-f0-9]{40}$/),
      INFRA_SOURCE_PATH: z.string().min(1).default(".local/infra"),
      PUBLIC_BUILD_ENV_JSON: z.string().default("{}"),
      GH_TOKEN: z.string().min(1),
      INFRA_DEPLOY_TOKEN: z.string().optional(),
    })
    .safeParse(process.env);
  if (!result.success) {
    throw new Error(
      "Invalid delivery settings: " +
        result.error.issues.map((issue) => issue.path.join(".")).join(", "),
    );
  }
  return result.data;
}
