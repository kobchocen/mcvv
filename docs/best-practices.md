# Best Practices

Guidelines for contributing to the Next Starter Boilerplate.

## Directory conventions

- `src/app` – Next.js App Router pages, layouts, and route handlers.
- `src/lib` – Reusable utilities. Subfolders separate concerns (e.g., `lib/db` for Prisma, `lib/env` for environment logic).
- `src/providers` – React context providers that wrap the entire app (theme, locale, etc.).
- `src/components` – Shared UI components. Organize by feature when components pair with specific business domains.
- `src/i18n` – Internationalization helpers and routing utilities.

## Environment variables

- Define every variable in `.env.example`.
- `src/lib/env.ts` validates runtime env vars with `zod` and throws during boot if something is missing or malformed.
- Import from `@/lib/env` instead of using `process.env` directly so validation happens once and type safety is preserved.
- `TIME_ZONE` defaults to `Europe/Prague`; override it in `.env` if your hosting region uses a different IANA identifier to keep `next-intl` rendering deterministic between server and client.

## Provider stack

- Global providers are composed in `src/providers/app-providers.tsx`. Add new providers (e.g., analytics, auth) to the `composers` array to keep layouts tidy.
- Export providers through `src/providers/index.ts` to keep import paths consistent (`@/providers`).

## Database access

- Use the shared Prisma client from `src/lib/db/client.ts`.
- Keep all Prisma models in `prisma/schema.prisma`. When adding a model, run `pnpm prisma:generate` and commit the resulting migration.
- Derive higher-level data access helpers (repositories/services) in `src/lib/db` or a `src/services` folder to avoid sprinkling raw Prisma calls everywhere.

## UI & theming

- Use the `ThemeProvider` and `useTheme` hook when reading or toggling color schemes.
- Prefer co-locating feature-specific components inside `src/app/(feature)` or `src/features/<name>` to keep contexts localized.

## Tooling

- Run `pnpm lint` and `pnpm format:check` before opening PRs.
- Consider adding tests under `src/__tests__` or feature folders as the project grows.
