# Malá cena Velké Verandy

Web pro tradiční lesní kros **Malá cena Velké Verandy** v Chocni. Projekt slouží jako
prezentační landing page závodu s informacemi o trati, termínu, propozicích, výsledcích,
galerii a kontaktech na pořadatele.

## Co web obsahuje

- hero sekci s hlavním claimem závodu a rychlými statistikami tratě
- informace o závodě, profilu a technickém charakteru trasy
- termín, místo startu, harmonogram a základní propozice
- výsledkovou sekci s historií ročníků
- galerii s fotkami závodu a prostředí Velké Verandy
- přepínač jazyka a světlý/tmavý režim
- locale-aware routing přes `next-intl`

## Technologie

- Next.js 16 App Router
- React 19
- TypeScript
- Tailwind CSS 4
- shadcn/ui a Radix UI primitives
- next-intl pro češtinu a angličtinu
- Prisma připravená pro MariaDB/MySQL
- pnpm

## Požadavky

- Node.js `24.15.0`
- pnpm `11.4.0` přes Corepack
- MariaDB nebo MySQL, pokud budete spouštět Prisma migrace nebo dynamická data
- Git

Použijte verze definované v `package.json`. Pokud používáte `nvm`, přepněte se před
instalací na správnou verzi Node.js.

```bash
nvm use
corepack enable
corepack install
```

## Lokální spuštění

1. Nainstalujte závislosti.

   ```bash
   pnpm install
   ```

2. Vytvořte lokální `.env` ze šablony, pokud ho ještě nemáte.

   ```bash
   cp .env.example .env
   ```

3. Pokud budete pracovat s databází, nastavte v `.env` `DATABASE_URL` na lokální
   MariaDB/MySQL instanci.

   ```env
   DATABASE_URL="mysql://mcvv:mcvv@localhost:3306/mcvv"
   ```

4. Spusťte vývojový server.

   ```bash
   pnpm dev
   ```

5. Otevřete web v prohlížeči.

   <http://localhost:3000>

## Užitečné příkazy

```bash
pnpm dev              # vývojový server
pnpm build            # produkční build
pnpm start            # spuštění produkčního buildu
pnpm lint             # ESLint
pnpm format           # Prettier, zapíše změny
pnpm format:check     # Prettier kontrola bez zápisu
pnpm prisma:generate  # regenerování Prisma Clientu
pnpm prisma:migrate   # vývojová migrace, pokud se začne používat databáze
```

Před odesláním změn spusťte:

```bash
pnpm lint
pnpm format:check
pnpm build
```

## Kde měnit obsah

- České texty: `src/i18n/locales/cs/common.json`
- Anglické texty: `src/i18n/locales/en/common.json`
- Hlavní stránka: `src/components/templates/mcvv-homepage-template.tsx`
- Lokální routa: `src/app/[locale]/page.tsx`
- Globální layout a metadata: `src/app/layout.tsx`
- Globální barvy, fonty a Tailwind tokeny: `src/app/globals.css`
- Fotky a statické assety: `public/mcvv/`
- Design podklady: `docs/design/`

Obsah landing page je napojený hlavně přes překlady v `common.json`. Při změně textů
zachovejte stejnou strukturu klíčů pro obě jazykové mutace.

## Struktura projektu

- `src/app/[locale]/` obsahuje locale-aware stránky.
- `src/components/atoms` obsahuje malé projektové komponenty, například brand,
  přepínač jazyka a přepínač theme.
- `src/components/molecules` obsahuje opakované bloky jako info karty, statistiky a
  výsledkové karty.
- `src/components/templates` obsahuje kompozici celé homepage.
- `src/components/ui` obsahuje generované shadcn/ui primitives.
- `src/i18n` obsahuje routing a překlady.
- `src/providers` skládá globální providery pro locale, theme a i18n.
- `src/lib` obsahuje sdílené utility, env validaci a připravený Prisma client.

Pro importy ze `src` používejte alias `@/`.

## Práce s UI

Barvy webu jsou sjednocené přes CSS proměnné v `src/app/globals.css`. Projektové tokeny
`race-*` definují zeleno-oranžovou paletu závodu a shadcn/ui komponenty na ni navazují
přes semantické tokeny jako `primary`, `accent`, `popover`, `border` a `ring`.

Projektové komponenty upravujte v `src/components/{atoms,molecules,organisms,templates}`.
Generované primitives v `src/components/ui` měňte jen tehdy, když je potřeba upravit
sdílené chování všech UI prvků.

## Environment configuration

- Lokální proměnné patří do `.env`, který se necommituje.
- Nové proměnné dokumentujte v `.env.example`.
- Validace prostředí je v `src/lib/env.ts`.
- V aplikaci preferujte import `{ env }` z `@/lib/env` místo přímého čtení
  `process.env`.

## Poznámky k databázi

Prisma konfigurace je připravená pro MariaDB/MySQL přes `DATABASE_URL` ve formátu
`mysql://USER:PASSWORD@HOST:PORT/DATABASE`. Současná landing page je ale statická a
data čerpá z překladových JSON souborů a assetů v `public/mcvv/`.

Databázi budete potřebovat až ve chvíli, kdy se začne ukládat dynamický obsah,
registrace nebo výsledky. Po změně Prisma schématu spusťte `pnpm prisma:generate` a
pro lokální migrace použijte `pnpm prisma:migrate`.
