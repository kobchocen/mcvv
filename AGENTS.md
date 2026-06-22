# Repository Guidelines

## Project Structure & Module Organization

This is a Next.js 16 App Router project using TypeScript and pnpm. User-facing routes live in `src/app/[locale]/`; keep locale-aware pages beneath that segment. Shared code belongs in `src/lib`, global React providers in `src/providers`, hooks in `src/hooks`, and translations in `src/i18n/locales/<locale>/common.json`.

Components follow an atomic hierarchy: project components live in `src/components/{atoms,molecules,organisms,templates}`, while generated shadcn/ui primitives live in `src/components/ui`. Static files belong in `public/`. Prisma models are defined in `prisma/schema.prisma`. Use the `@/` alias for imports from `src`.

## Build, Test, and Development Commands

- `pnpm install`: install dependencies using the pinned pnpm version.
- `pnpm dev`: start the local development server.
- `pnpm build`: create a production build and catch Next.js/type errors.
- `pnpm lint`: run ESLint with Next.js Core Web Vitals and TypeScript rules.
- `pnpm format` / `pnpm format:check`: write or verify Prettier formatting.
- `pnpm prisma:generate`: regenerate Prisma Client after schema changes.
- `pnpm prisma:migrate`: create and apply a development migration.

Use Node `24.15.0` (`nvm use`) and pnpm `11.4.0` through Corepack.

## Coding Style & Naming Conventions

Prettier enforces 2-space indentation, semicolons, double quotes, trailing commas, and a 100-character line width. TypeScript is strict. Name React components in PascalCase, hooks with a `use-` filename prefix, and other modules in kebab-case. Prefer named exports through local `index.ts` barrels. Do not edit generated shadcn primitives directly.

Import validated configuration from `@/lib/env`, locale-aware navigation from `@/i18n/routing`, and the shared Prisma client from `@/lib/db/client`.

## Testing Guidelines

No automated test framework or coverage threshold is configured yet. Before submitting changes, run `pnpm lint`, `pnpm format:check`, and `pnpm build`. When introducing tests, use `*.test.ts` or `*.test.tsx`, colocated with the feature or under `src/__tests__`, and add the runner command to `package.json`.

## Commit & Pull Request Guidelines

Recent history follows Conventional Commit-style subjects such as `feat:`, `fix:`, `refactor(src):`, and `chore(deps):`. Keep commits focused and use an imperative, concise subject.

Pull requests should explain the problem and solution, link related issues, list verification commands, and include screenshots for UI changes. Note schema, migration, translation, or environment-variable changes explicitly. Husky runs lint and `format:check` before commits; resolve failures rather than bypassing the hook.

## Security & Configuration

Copy `.env.example` locally and never commit secrets. Document every new variable there and validate it in `src/lib/env.ts`; avoid direct `process.env` access elsewhere.
