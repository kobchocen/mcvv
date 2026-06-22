# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev               # start dev server
pnpm build             # production build
pnpm lint              # ESLint
pnpm format            # Prettier (write)
pnpm format:check      # Prettier (check only)
pnpm prisma:generate   # regenerate Prisma Client after schema changes
pnpm prisma:migrate    # create & apply a dev migration
pnpm prisma:studio     # open Prisma Studio
```

Requires Node 24.15.0 (`.nvmrc`) and pnpm 11.4.0 via Corepack. Run `nvm use && corepack enable` before anything else on a fresh machine.

The husky `pre-commit` hook runs `pnpm lint` and `pnpm format:check` on every commit — fix failures before committing.

## Environment

Copy `.env.example` → `.env` and set `DATABASE_URL` (PostgreSQL connection string). `src/lib/env.ts` validates env vars with Zod on boot and throws if required values are missing or malformed. **Import `{ env }` from `@/lib/env` everywhere** — never read `process.env` directly.

Validated variables: `NODE_ENV`, `DATABASE_URL`, `TIME_ZONE` (defaults to `Europe/Prague`).

## Architecture

### Routing & i18n

All user-facing pages live under `src/app/[locale]/`. The app supports `cs` (default) and `en` locales with `localePrefix: "always"`. Routing helpers (`Link`, `redirect`, `usePathname`, `useRouter`) come from `@/i18n/routing` — use these instead of `next/navigation` so locale is preserved automatically.

Translation messages are per-locale JSON files at `src/i18n/locales/<locale>/common.json`, loaded server-side in `src/i18n/request.ts`.

### Provider stack

`src/providers/app-providers.tsx` composes `LocaleProvider` → `ThemeProvider` → `NextIntlClientProvider` via a `composers` array. Add new global providers to that array — don't wrap them in the layout files directly.

The locale layout at `src/app/[locale]/layout.tsx` injects `locale`, `messages`, and `env.TIME_ZONE` into `AppProviders`.

### Database

Shared Prisma client is in `src/lib/db/client.ts` — it's attached to `global.prisma` to survive hot reloads. Import `{ prisma }` from there; don't instantiate `PrismaClient` elsewhere.

Schema lives in `prisma/schema.prisma` (PostgreSQL datasource). After editing the schema, run `pnpm prisma:generate` and commit the generated client alongside the migration.

### Components

`src/components/ui/` — shadcn/ui primitives (do not edit generated files directly; re-run the shadcn CLI to update).  
`src/components/atoms/` — small, project-specific presentational components (e.g., `ThemeToggle`, `LanguageSwitcher`).  
`src/components/molecules/` — compositions of atoms.  
Feature-specific components should live co-located in `src/app/(feature)/` or `src/features/<name>/`.

### Path aliases

`@/` resolves to `src/`. Use it for all internal imports.
