# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

**Malá cena Velké Verandy** — a presentation site for a traditional forest cross-country race in Choceň. The app is dynamic: copy and race regulations live in translation JSON, while results, editions, and gallery photos are read from MariaDB via Prisma at request time. Homepage and results routes set `dynamic = "force-dynamic"`. Registration UI is not built yet; the Prisma models already exist.

## Commands

```bash
pnpm dev               # start dev server (http://localhost:3000)
pnpm build             # production build — also catches type errors
pnpm start             # serve the production build locally
pnpm lint              # ESLint
pnpm format            # Prettier (write)
pnpm format:check      # Prettier (check only)
pnpm prisma:generate   # regenerate Prisma Client after schema changes
pnpm prisma:migrate    # create & apply a dev migration
pnpm prisma:seed       # seed dictionary tables (categories, photo authors, locations)
pnpm prisma:studio     # open Prisma Studio
```

Local MariaDB: `docker compose -f compose.dev.yaml up -d`. The app will not render homepage, gallery, or results without a reachable `DATABASE_URL`.

Requires Node 24.15.0 (`.nvmrc`) and pnpm 11.4.0 via Corepack. Run `nvm use && corepack enable` before anything else on a fresh machine.

There is no test framework configured yet. The pre-submit verification path is `pnpm lint && pnpm format:check && pnpm build`.

The husky `pre-commit` hook runs `pnpm lint` and `pnpm format:check` on every commit — fix failures before committing.

## Environment

Copy `.env.example` → `.env` and set `DATABASE_URL` (MySQL/MariaDB connection string, e.g. `mysql://mcvv:mcvv@localhost:3306/mcvv`). `src/lib/env.ts` validates env vars with Zod on boot and throws if required values are missing or malformed. **Import `{ env }` from `@/lib/env` everywhere** — never read `process.env` directly.

Validated variables: `NODE_ENV`, `DATABASE_URL`, `TIME_ZONE` (defaults to `Europe/Prague`), `CONTACT_TO` (defaults to `mcvv@mcvv.org`). Optional SMTP: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`. Without `SMTP_HOST` the contact form logs the message and still succeeds. Optional auth: `SESSION_SECRET` (min. 32 characters), `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `ADMIN_NAME`, `ORGANIZER_EMAIL` / `ORGANIZER_PASSWORD` / `ORGANIZER_NAME`. Seed creates Pavel (admin) and Martin (organizer) when those pairs are set. Never commit passwords.

## Architecture

### Routing, middleware & i18n

All user-facing pages live under `src/app/[locale]/`. The app supports `cs` (default) and `en` locales with `localePrefix: "always"`.

`proxy.ts` at the repository root is the **Next.js middleware** file (next-intl routing). It intercepts all requests and rewrites locale-prefixed paths. `next-intl.config.ts` (also at root) defines the `defineRouting(...)` config and is imported as `@/next-intl.config` via a `tsconfig.json` path alias.

Routing helpers (`Link`, `redirect`, `usePathname`, `useRouter`) come from `@/i18n/routing` — use these instead of `next/navigation` so locale is preserved automatically.

Translation messages live at `src/i18n/locales/<locale>/common.json` and are loaded server-side by `src/i18n/request.ts`. Lower-level next-intl client/server helpers (used outside components) are in `src/lib/i18n/`.

### Content data flow

Copy and race regulations stay in translations; live race data comes from Prisma.

- **Copy / i18n:** `src/i18n/locales/<locale>/common.json`. Homepage and `/program` call `t.raw(...)` and cast to `McvvHomepageContent` / `McvvProgramContent` (`src/components/templates/`). When changing copy, edit both locale files and keep the TypeScript types in sync.
- **Results:** `/results` and `/results/[year]` query `Result`, `Category`, `Club`, `Edition`, `StartEntry`, and `Split`. Homepage result cards use the latest three years from the same tables (JSON winners are fallback only).
- **Gallery:** homepage samples portrait blobs from `Photo` (`mcvv_fotky`) and serves them through `/api/test/fotka?id=`. Static files in `public/images/` and `public/illustrations/` are fallbacks.
- **Not wired yet:** registration UI, `News`, and `Sponsor` (partner names still come from JSON).

### Provider stack

`src/providers/app-providers.tsx` composes `LocaleProvider` → `ThemeProvider` → `NextIntlClientProvider` via a `composers` array. Add new global providers to that array — don't wrap them in the layout files directly.

The locale layout at `src/app/[locale]/layout.tsx` injects `locale`, `messages`, and `env.TIME_ZONE` into `AppProviders`.

### Database

Shared Prisma client is in `src/lib/db/client.ts` — attached to `global.prisma` to survive hot reloads. Import `{ prisma }` from there; don't instantiate `PrismaClient` elsewhere.

Schema lives in `prisma/schema.prisma` (MySQL/MariaDB datasource mapped onto legacy table names). `pnpm prisma:seed` upserts dictionary tables only; historical results and photos are imported from the old site (`docs/sql_create.sql`, `docs/sql_pl_data.sql`). After editing the schema, run `pnpm prisma:generate` and commit the generated client alongside the migration. `prisma migrate dev` needs the `mcvv_shadow` database (see `compose.dev.yaml`).

### Components

Components follow an **atomic hierarchy**:

- `src/components/ui/` — shadcn/ui primitives; do not edit directly, re-run the shadcn CLI to update.
- `src/components/atoms/` — small project-specific presentational pieces (brand, language switcher, theme toggle, section eyebrow).
- `src/components/molecules/` — compositions of atoms (stat card, info card, result card, section header).
- `src/components/organisms/` — full page sections (hero, overview, profile, schedule, info, results, gallery, partners, footer, final CTA).
- `src/components/templates/` — full page compositions (`McvvHomepageTemplate`) and the content type contract (`McvvHomepageContent`).

Each tier has a barrel `index.ts`. Import via `@/components/{tier}`.

### Design tokens & fonts

All visual tokens are CSS custom properties defined in `src/app/globals.css` and mapped into Tailwind v4 via `@theme inline`. The race-specific palette uses `race-*` tokens (OKLCH green/orange scale: `race-deep`, `race-forest`, `race-forest-2`, `race-surface`, `race-line`, `race-muted`, `race-dim`, `race-accent`, `race-accent-hover`). shadcn semantic tokens (`primary`, `accent`, `border`, etc.) point at these race tokens.

Two fonts: **Inter** (variable `--font-inter`, Tailwind class `font-sans`) and **Oswald** (variable `--font-display`, Tailwind class `font-display`).

### Health probes

`/healthz` and `/readyz` are liveness/readiness endpoints (`src/app/healthz/route.ts`, `src/app/readyz/route.ts`) for k8s probes. Both return `{ status: "ok" }` with `Cache-Control: no-store`.

### Path aliases

`@/` resolves to `src/`. `@/next-intl.config` resolves to the root `next-intl.config.ts` (explicit alias in `tsconfig.json`).
