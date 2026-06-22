# Next Starter Boilerplate

Moderní Next.js 16 starter s TypeScriptem, Prisma 7, pnpm, i18n a připravenou
strukturou pro rychlý start aplikace.

## Obsah

- [Požadavky](#požadavky)
- [macOS: příprava lokálního prostředí](#macos-příprava-lokálního-prostředí)
- [Windows: příprava lokálního prostředí přes WSL](#windows-příprava-lokálního-prostředí-přes-wsl)
- [Stažení repozitáře](#stažení-repozitáře)
- [Nastavení projektu](#nastavení-projektu)
- [Databáze a Prisma](#databáze-a-prisma)
- [Spuštění projektu](#spuštění-projektu)
- [Vývoj ve VS Code, Claude Code a Codex](#vývoj-ve-vs-code-claude-code-a-codex)
- [Užitečné příkazy](#užitečné-příkazy)
- [Struktura projektu](#struktura-projektu)

## Požadavky

Projekt používá:

- Git
- VS Code
- Node.js `24.15.0` přes nvm (`.nvmrc` je součástí repozitáře)
- Corepack
- pnpm `11.4.0`
- PostgreSQL databázi dostupnou přes `DATABASE_URL`
- Volitelně Docker / Docker Desktop

Oficiální návody:

- Git: <https://git-scm.com/book/en/v2/Getting-Started-Installing-Git>
- VS Code: <https://code.visualstudio.com/docs/setup/setup-overview>
- nvm: <https://github.com/nvm-sh/nvm>
- Node.js Corepack: <https://nodejs.org/api/corepack.html>
- pnpm přes Corepack: <https://pnpm.io/installation#using-corepack>
- PostgreSQL: <https://www.postgresql.org/download/>
- Docker Desktop: <https://docs.docker.com/desktop/>
- WSL: <https://learn.microsoft.com/windows/wsl/install>

## macOS: příprava lokálního prostředí

1. Nainstalujte Xcode Command Line Tools.

   ```bash
   xcode-select --install
   ```

2. Nainstalujte Homebrew, pokud ho ještě nemáte.

   Návod: <https://brew.sh/>

3. Nainstalujte Git.

   ```bash
   brew install git
   git --version
   ```

4. Nainstalujte VS Code.

   ```bash
   brew install --cask visual-studio-code
   ```

   Návod: <https://code.visualstudio.com/docs/setup/mac>

5. Nainstalujte nvm.

   ```bash
   brew install nvm
   mkdir -p ~/.nvm
   ```

   Přidejte do `~/.zshrc` konfiguraci podle instrukcí z Homebrew výstupu:

   ```bash
   export NVM_DIR="$HOME/.nvm"
   [ -s "/opt/homebrew/opt/nvm/nvm.sh" ] && \. "/opt/homebrew/opt/nvm/nvm.sh"
   [ -s "/opt/homebrew/opt/nvm/etc/bash_completion.d/nvm" ] && \
     \. "/opt/homebrew/opt/nvm/etc/bash_completion.d/nvm"
   ```

   Na Intel Macu může být cesta `/usr/local/opt/nvm` místo `/opt/homebrew/opt/nvm`.
   Po úpravě shell znovu načtěte:

   ```bash
   source ~/.zshrc
   nvm --version
   ```

   Alternativní oficiální návod: <https://github.com/nvm-sh/nvm#installing-and-updating>

6. Nainstalujte PostgreSQL lokálně.

   ```bash
   brew install postgresql@16
   brew services start postgresql@16
   createuser -s postgres
   psql postgres -c "ALTER USER postgres PASSWORD 'postgres';"
   createdb next_starter
   ```

   Pokud role `postgres` už existuje, příkaz `createuser -s postgres` může skončit
   chybou. V takovém případě pokračujte nastavením hesla a vytvořením databáze.
   Pokud `createdb` není dostupné, přidejte PostgreSQL do `PATH` podle výstupu Homebrew.

7. Volitelně nainstalujte Docker Desktop.

   ```bash
   brew install --cask docker
   ```

   Docker se hodí pro databáze a produkční build image, ale pro běžný lokální vývoj
   není povinný.

## Windows: příprava lokálního prostředí přes WSL

Na Windows je doporučený vývoj přes WSL 2 s Ubuntu. Projekt pak běží v Linuxovém
prostředí, což je nejbližší produkci a vyhne se rozdílům ve filesystemu a nástrojích.

1. Nainstalujte WSL s Ubuntu.

   Otevřete PowerShell jako administrátor:

   ```powershell
   wsl --install -d Ubuntu
   ```

   Restartujte počítač, pokud vás k tomu instalátor vyzve.

   Návod: <https://learn.microsoft.com/windows/wsl/install>

2. Spusťte Ubuntu a aktualizujte balíčky.

   ```bash
   sudo apt update
   sudo apt upgrade -y
   ```

3. Nainstalujte základní nástroje a Git.

   ```bash
   sudo apt install -y git curl build-essential ca-certificates
   git --version
   ```

4. Nainstalujte VS Code ve Windows.

   Návod: <https://code.visualstudio.com/docs/setup/windows>

   Potom do VS Code přidejte rozšíření WSL:
   <https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-wsl>

5. Nainstalujte nvm uvnitř WSL.

   Použijte aktuální příkaz z oficiálního návodu:
   <https://github.com/nvm-sh/nvm#installing-and-updating>

   Po instalaci znovu načtěte shell:

   ```bash
   source ~/.bashrc
   nvm --version
   ```

6. Nainstalujte PostgreSQL uvnitř WSL.

   ```bash
   sudo apt install -y postgresql postgresql-contrib
   sudo service postgresql start
   sudo -u postgres createdb next_starter
   ```

   Pokud chcete používat přihlašovací údaje z `.env.example`, nastavte heslo uživatele
   `postgres` na `postgres`:

   ```bash
   sudo -u postgres psql
   ```

   V `psql` spusťte:

   ```sql
   ALTER USER postgres PASSWORD 'postgres';
   \q
   ```

7. Volitelně nainstalujte Docker Desktop pro Windows a zapněte WSL integration.

   Návod: <https://docs.docker.com/desktop/features/wsl/>

## Stažení repozitáře

Doporučený adresář:

- macOS: `~/Workspace`
- Windows přes WSL: `~/workspace`

macOS:

```bash
mkdir -p ~/Workspace
cd ~/Workspace
git clone https://github.com/martinkrivda/next-starter-boilerplate.git
cd next-starter-boilerplate
```

Windows přes WSL:

```bash
mkdir -p ~/workspace
cd ~/workspace
git clone https://github.com/martinkrivda/next-starter-boilerplate.git
cd next-starter-boilerplate
```

Projekt mějte uložený ve WSL filesystemu (`~/workspace/...`), ne ve Windows cestě typu
`/mnt/c/...`. Vývoj a instalace balíčků jsou ve WSL filesystemu rychlejší a stabilnější.

Pokud už repozitář máte stažený a chcete jen stáhnout aktuální změny:

```bash
cd ~/Workspace/next-starter-boilerplate
git pull
```

Ve WSL použijte:

```bash
cd ~/workspace/next-starter-boilerplate
git pull
```

## Nastavení projektu

1. Nainstalujte a použijte Node.js verzi z `.nvmrc`.

   ```bash
   nvm install
   nvm use
   node --version
   ```

   Očekávaná verze je `v24.15.0`.

2. Aktivujte Corepack.

   ```bash
   corepack enable
   ```

3. Nainstalujte pnpm verzi připnutou v `package.json`.

   ```bash
   corepack install
   pnpm --version
   ```

   Očekávaná verze je `11.4.0`.

4. Nainstalujte dependencies.

   ```bash
   pnpm install
   ```

5. Vytvořte lokální `.env` z šablony.

   ```bash
   cp .env.example .env
   ```

6. Zkontrolujte `DATABASE_URL` v `.env`.

   Výchozí hodnota odpovídá lokální PostgreSQL databázi:

   ```env
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/next_starter?schema=public"
   TIME_ZONE="Europe/Prague"
   ```

## Databáze a Prisma

`prisma/schema.prisma` používá PostgreSQL datasource a Prisma v7 client generator.
Sdílený Prisma client je v `src/lib/db/client.ts`.

Po vytvoření databáze spusťte:

```bash
pnpm prisma:generate
pnpm prisma:migrate
```

Prisma Studio pro prohlížení dat:

```bash
pnpm prisma:studio
```

Volitelně můžete PostgreSQL pustit přes Docker místo lokální instalace:

```bash
docker run --name next-starter-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=next_starter \
  -p 5432:5432 \
  -d postgres:16
```

Při dalším spuštění stejného kontejneru:

```bash
docker start next-starter-postgres
```

## Spuštění projektu

1. Ujistěte se, že databáze běží.

2. Spusťte vývojový server.

   ```bash
   pnpm dev
   ```

3. Otevřete aplikaci v prohlížeči:

   <http://localhost:3000>

4. Před odesláním změn spusťte kontrolní příkazy.

   ```bash
   pnpm lint
   pnpm format:check
   pnpm build
   ```

## Vývoj ve VS Code, Claude Code a Codex

### VS Code

1. Otevřete projekt.

   macOS:

   ```bash
   cd ~/Workspace/next-starter-boilerplate
   code .
   ```

   Windows přes WSL:

   ```bash
   cd ~/workspace/next-starter-boilerplate
   code .
   ```

2. Pro WSL vždy otevírejte projekt přes `code .` uvnitř Ubuntu terminálu nebo přes
   příkaz `WSL: Open Folder in WSL`.

3. Doporučená rozšíření:

   - ESLint: <https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint>
   - Prettier: <https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode>
   - Tailwind CSS IntelliSense:
     <https://marketplace.visualstudio.com/items?itemName=bradlc.vscode-tailwindcss>
   - Prisma: <https://marketplace.visualstudio.com/items?itemName=Prisma.prisma>
   - WSL pro Windows:
     <https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-wsl>

### Claude Code

Claude Code používá instrukce z `CLAUDE.md`.

1. Otevřete terminál v kořeni projektu.

   ```bash
   cd ~/Workspace/next-starter-boilerplate
   ```

   Ve WSL použijte:

   ```bash
   cd ~/workspace/next-starter-boilerplate
   ```

2. Spusťte Claude Code podle oficiální dokumentace:

   <https://docs.anthropic.com/en/docs/claude-code>

3. Před prací zkontrolujte, že používáte správnou Node verzi.

   ```bash
   nvm use
   corepack enable
   ```

### Codex

Codex používá instrukce z `AGENTS.md`.

1. Otevřete terminál v kořeni projektu.

2. Spusťte Codex podle oficiální dokumentace:

   <https://developers.openai.com/codex>

3. Pro změny v projektu používejte stejné ověřovací příkazy jako lokálně:

   ```bash
   pnpm lint
   pnpm format:check
   pnpm build
   ```

## Užitečné příkazy

```bash
pnpm dev              # start vývojového serveru
pnpm build            # produkční build
pnpm start            # start produkčního buildu
pnpm lint             # ESLint
pnpm format           # Prettier, zapíše změny
pnpm format:check     # Prettier kontrola bez zápisu
pnpm prisma:generate  # regenerování Prisma Clientu
pnpm prisma:migrate   # vytvoření a aplikace vývojové migrace
pnpm prisma:studio    # Prisma Studio
```

Husky pre-commit hook spouští `pnpm lint` a `pnpm format:check`. Selhání opravte
před commitem.

## Environment configuration

- `src/lib/env.ts` validuje `process.env` přes `zod` a spadne brzy, pokud chybí
  důležitá hodnota jako `DATABASE_URL`.
- Importujte `{ env }` z `@/lib/env` místo přímého čtení `process.env`.
- `TIME_ZONE` má výchozí hodnotu `Europe/Prague`, ale lze ji přepsat v `.env`.
- Každou novou environment proměnnou dokumentujte v `.env.example` a validujte v
  `src/lib/env.ts`.

## Global providers

- `src/providers/app-providers.tsx` skládá locale, theme a internationalization
  providery. Další globální providery přidávejte sem.
- Jednotlivé providery, například `ThemeProvider` nebo `LocaleProvider`, jsou dostupné
  přes `@/providers`.
- `AppProviders` dostává validovaný `timeZone`, aby `NextIntlClientProvider` měl vždy
  explicitní konfiguraci.

## Struktura projektu

- User-facing routy jsou v `src/app/[locale]/`.
- Sdílený kód patří do `src/lib`.
- Globální React providery jsou v `src/providers`.
- Hooks jsou v `src/hooks`.
- Překlady jsou v `src/i18n/locales/<locale>/common.json`.
- Projektové komponenty jsou v `src/components/{atoms,molecules,organisms,templates}`.
- Generované shadcn/ui primitives jsou v `src/components/ui`; neupravujte je ručně.
- Statické soubory patří do `public/`.
- Prisma modely jsou v `prisma/schema.prisma`.
- Pro importy ze `src` používejte alias `@/`.

Další konvence a doporučení jsou v `docs/best-practices.md`.
