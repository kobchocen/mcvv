# MCVV — stav projektu pro analytika / moderátora

Dokument je předávka k **15. 9. 2026**. Cíl: další Grok (analytik/moderátor) může navázat bez znovuobjevování kódu — chystat analýzy, prompty pro vývoj a revize.

**Produkt:** web tradičního lesního krosu _Malá cena Velké Verandy_ (K.O.B. Choceň).  
**Repo:** `git@github.com:kobchocen/mcvv.git`  
**Workspace:** `/Users/pavelsvadlena/clients/kobchocen/mcvv/web`  
**Vlastník:** Pavel Švadlena. Komunikace s ním česky.

Web **není a nebude statický**. Copy žije v překladech, živá data (výsledky, ročníky, fotky) v MariaDB přes Prisma.

---

## 1. Role tohoto dokumentu

Použij ho jako zdroj pravdy o stavu, ne jako roadmapu schválenou vlastníkem. Roadmapu teprve navrhni a nech si odsouhlasit.

Co od tebe vlastník chce:

1. Analýza dalšího postupu (priority, závislosti, rizika).
2. Prompty / briefy pro vývojové agenty (malé, ověřitelné úkoly).
3. Revize po implementaci (funkce, copy, i18n, konzistence s DB).

Co **nedělej**, dokud to vlastník výslovně neřekne:

- Push na `origin`.
- Přepisovat profil tratě (považuje ho za hotový, commitnuto).
- Velké refaktory mimo zadaný brief.

---

## 2. Co se stalo v této session (15. 9. 2026)

Po pauze od 27. 6. 2026:

1. Prohlídka stavu, ústní resume.
2. Lokální `pnpm dev` na http://localhost:3000 (Node 24.15.0). MariaDB kontejner `mcvv-db-dev` už běžel.
3. Oprava dokumentace: web je dynamický (`README.md`, `CLAUDE.md`, `AGENTS.md`, komentář v `compose.dev.yaml`). **Tyto změny nejsou v commitu.**
4. Profil tratě označen za dokončený a **commitnutý lokálně, nepushnutý.**

---

## 3. Git

| Položka       | Hodnota                                                           |
| ------------- | ----------------------------------------------------------------- |
| Větev         | `main`                                                            |
| HEAD          | `30753b0` `feat: finalize course elevation profile` (15. 9. 2026) |
| `origin/main` | `2c0cbf6` `výsledky, homepage photos` (27. 6. 2026)               |
| Vzdálenost    | **1 lokální commit před remote. Push zakázán.**                   |
| Issues        | žádné                                                             |

Historie (nejnovější nahoře):

```
30753b0  2026-09-15  feat: finalize course elevation profile   ← jen lokálně
2c0cbf6  2026-06-27  výsledky, homepage photos
bf378d4  2026-06-27  výsledky, homepage photos
66d7bfc  2026-06-26  feat:initial scheme add
0aca8ec  2026-06-22  feat: add program page, navbar menu
07b84ee  2026-06-22  change path to assets
04c44a4  2026-06-22  update license file
656ca62  2026-06-22  chore(claude): update claude.md
688753f  2026-06-22  chore: initial web for mcvv
5064be6  2026-06-22  Initial commit
```

Styl commitů je smíšený (někdy Conventional, někdy volná čeština). Preferuj `feat:` / `fix:` / `docs:` / `chore:` a **nepushuj**, dokud to vlastník neřekne.

### 3.1 Commitnuté v `30753b0` (profil tratě)

- `src/components/organisms/mcvv-profile-section.tsx` — reálná SVG křivka, čísla kopců 1–4 na vrcholech, 286 / 343 m n. m., osa km.
- `src/components/templates/mcvv-homepage-content.ts` — `axis` a `points` volitelné.
- `src/i18n/locales/cs/common.json`, `en/common.json` — osa `START … 4 km … CÍL · 4,3 km`, „200 m převýšení“, bahno nebo sníh.

### 3.2 Working tree (necommitnuto)

Upravené:

- `README.md`, `CLAUDE.md`, `AGENTS.md`, `compose.dev.yaml` — dokumentace dynamického webu.
- `src/components/organisms/mcvv-gallery-section.tsx` — `sizes` u Next `<Image>` (1 řádek na velkou + 1 na malé fotky).

Untracked, **nesahá do runtime**:

- `dumps/` — pracovní podklady profilu (`mcvv profil design.pdf`, 3 SVG, `profil.jpg`). Křivka je už inlinovaná v komponentě.
- `public/images/elevation-profile.jpg` — nepoužívá se (profil je SVG).

Doporučení: docs + gallery `sizes` commitnout jako `docs:` / `fix:`; `dumps/` a `elevation-profile.jpg` do gitu nedávat, případně přidat `dumps/` do `.gitignore`.

---

## 4. Jak spustit

Požadavky: Node **24.15.0** (`.nvmrc`), pnpm **11.4.0**, Docker.

```bash
nvm use
corepack enable
pnpm install
cp .env.example .env          # pokud chybí
docker compose -f compose.dev.yaml up -d
pnpm prisma:generate
pnpm dev                      # http://localhost:3000 → /cs
```

`DATABASE_URL` default: `mysql://mcvv:mcvv@localhost:3306/mcvv`.  
Validace v `src/lib/env.ts` (Zod): `NODE_ENV`, `DATABASE_URL`, volitelně `SHADOW_DATABASE_URL`, `TIME_ZONE` (default `Europe/Prague`). Nikde nečíst `process.env` přímo.

Homepage, galerie a výsledky **bez DB nespadnou do statického fallbacku natrvalo** — stránky jsou `force-dynamic` a volají Prisma. Bez dat v tabulkách jsou prázdné / s JSON fallback vítězi.

Ověření před commitem (husky `pre-commit` = lint + format:check):

```bash
pnpm lint && pnpm format:check && pnpm build
```

Test framework **není**.

---

## 5. Architektura

### 5.1 Stack

Next.js 16.2.9 App Router, React 19, TypeScript strict, Tailwind 4, shadcn/ui + Radix, next-intl 4, Prisma 7 (`@prisma/adapter-mariadb` + `mariadb`), MariaDB LTS, pnpm, Husky, Prettier (2 mezery, double quotes, 100 znaků, semicolony).

`package.json` se pořád jmenuje `next-starter-boilerplate` — kosmetický dluh.

### 5.2 Routing a i18n

- Uživatelské stránky: `src/app/[locale]/`.
- Locales: `cs` (default), `en`. `localePrefix: "always"`.
- Middleware: `proxy.ts` (next-intl).
- Routing config: `next-intl.config.ts` alias `@/next-intl.config`.
- Navigace: `@/i18n/routing` (`Link`, `redirect`, `usePathname`, `useRouter`) — **ne** `next/navigation`, jinak se ztratí locale.
- Překlady: `src/i18n/locales/<locale>/common.json`, load `src/i18n/request.ts`.

`pathnames` v `next-intl.config.ts` eviduje jen `/` a `/program`. **`/results` a `/results/[year]` tam nejsou** — odkazy na výsledky často používají `next/link` s ručním `/${locale}/results`.

Kořen `src/app/page.tsx` jen redirectne na `/${defaultLocale}`.

### 5.3 Tok dat

Dva zdroje, nemíchat:

| Typ                                               | Zdroj                                                                 | Kde                                                             |
| ------------------------------------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------- |
| Copy, nav, rozpis, partneři, countdown, CTA texty | `common.json` + typy v `src/components/templates/`                    | homepage, `/program`                                            |
| Výsledky, ročníky, mezičasy                       | Prisma `Result`, `Category`, `Club`, `Edition`, `StartEntry`, `Split` | homepage karty (poslední 3 roky), `/results`, `/results/[year]` |
| Galerie                                           | Prisma `Photo` (BLOB `mcvv_fotky`)                                    | homepage, servírování `/api/test/fotka?id=`                     |

Homepage (`src/app/[locale]/page.tsx`):

1. `t.raw(...)` pro každou sekci → `McvvHomepageContent`.
2. Náhodný výběr portrait fotek z posledních 3 let: natáhne až 60 blobů, filtr `isPortraitImage`, nechá 7 ID.
3. Přepíše `results.years` z DB (count + nejrychlejší M/F). JSON vítězi (`Jan Novák` atd.) jsou **fallback**, když DB nemá ročníky.

`/program` je čistě z překladů.  
`/results*` je čistě z DB, `export const dynamic = "force-dynamic"`.

Typy musí zůstat v sync s **oběma** locale JSON.

### 5.4 Komponenty (atomic)

- `src/components/ui/` — shadcn, **needituj přímo**.
- `atoms/` — brand, language switcher, theme toggle, section eyebrow.
- `molecules/` — info/stat/result card, section header.
- `organisms/` — sekce homepage + navbar + footer.
- `templates/` — `McvvHomepageTemplate`, `McvvProgramTemplate` + content typy.
- `results/DownloadResultsButton.tsx` — klientský PDF export (jsPDF).

Import přes barrel `@/components/{tier}`.

Homepage skladba (`mcvv-homepage-template.tsx`):

Hero → Overview → Profile (`#route`) → Schedule (`#date`) → Info (`#info`) → Results (`#results`) → Gallery (`#gallery`) → Partners (`#partners`) → Final CTA (`#register`) → Footer.

### 5.5 Design

Tokeny v `src/app/globals.css`, Tailwind `@theme inline`. Paleta `race-*` (OKLCH zeleno-oranžová): `race-deep`, `race-forest`, `race-forest-2`, `race-surface`, `race-line`, `race-muted`, `race-dim`, `race-accent`, `race-accent-hover`.

Fonty: Inter (`font-sans`), Oswald (`font-display`).

Podklady: `docs/design/mcvv.pen` + generated PNG. Pracovní SVG/PDF profilu v `dumps/` (ne v gitu).

### 5.6 Infra

- `compose.dev.yaml` — MariaDB LTS, `mcvv-dev` / `mcvv-db-dev`, port 3306. Shadow DB `mcvv_shadow` je potřeba pro `prisma migrate dev` (komentář v compose).
- `Dockerfile` — multi-stage, `pnpm start`. Není standalone output; kopíruje `.next` + `public` + prod deps. **Není ověřené**, že produkční image umí Prisma adapter + `DATABASE_URL`.
- Probes: `/healthz`, `/readyz` → `{ status: "ok" }`, `Cache-Control: no-store`.
- `src/app/sitemap.ts` — `https://mcvv.cz` + `/{locale}` a `/{locale}/results`. Chybí `/program` a ročníky. Komentář „static is sufficient“ je zastaralý.
- `src/app/robots.txt` je **prázdný**.

---

## 6. Inventář funkcí

### Hotovo

| Oblast                        | Stav                                                                         |
| ----------------------------- | ---------------------------------------------------------------------------- |
| Homepage copy + vizuál        | Ano, cs/en. Countdown a partneři jsou placeholdery.                          |
| Profil tratě                  | **Hotovo** (commit `30753b0`). SVG z reálného výškového profilu.             |
| Rozpis `/program`             | Statický z JSON, 8 sekcí. CTA je mrtvý kotva `#register`.                    |
| Navbar                        | Overlay/solid, locale, theme, dropdown Závod (Rozpis / Termín / Trať).       |
| Archiv výsledků `/results`    | DB: výběr roku, kategorie vs. absolutně, mezičasy, vítězové, počasí ročníku. |
| Detail roku `/results/[year]` | DB listina po kategoriích, kotvy kategorií, PDF.                             |
| Galerie homepage              | 7 náhodných portrait fotek z DB + fallbacky z `public/`.                     |
| i18n + theme                  | cs/en, light/dark.                                                           |
| Prisma schéma                 | Legacy tabulky namapované, 1 migrace `20260626090015_initial_migration`.     |
| Seed                          | Jen číselníky: kategorie, autoři fotek, lokace, typy webimages.              |
| Dev DB                        | Docker Compose.                                                              |
| Health probes                 | Ano.                                                                         |

### Částečně / nedotažené

| Oblast                  | Mezera                                                                                                                                 |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Tlačítko „Přihlásit se“ | Všechny CTA (`hero`, `nav`, `schedule`, `finalCta`, program) jdou na `#register`. Final CTA odkazuje **sám na sebe**. Formulář není.   |
| Partneři                | JSON `["VERANDA","CHOCEŇ","RUNTECH","FOREST","SPORTIA","AKTIV"]`. Model `Sponsor` v DB existuje, UI ho nečte.                          |
| Countdown               | Natvrdo v JSON (`187` dní, `14` hodin…). Není živý.                                                                                    |
| Kontakt                 | `info@velkaveranda.cz`, `+420 777 123 456` — vypadá jako placeholder. `mailto:` je hardcoded v `mcvv-info-section.tsx`, ne z překladu. |
| Footer odkazy           | Prostý text, ne `<a href>`.                                                                                                            |
| Galerie                 | Jen homepage strip. Není archiv podle roku/místa. Endpoint je `/api/test/fotka` (test v URL).                                          |
| EN u výsledků           | Hodně UI stringů je česky i při `locale=en` (INFORMACE, Počasí, Roč. nar., Přepnout na absolutní…).                                    |
| PDF                     | Font z náhodného GitHub CDN (`Waifu2x-Extension-GUI`). Čeština závisí na tom, že CDN žije.                                             |
| Sitemap / robots        | Neúplné / prázdné.                                                                                                                     |
| next-intl pathnames     | `/results` není v configu.                                                                                                             |
| Dokumentace             | Aktualizovaná v working tree, necommitnutá. `CLAUDE.md` na remote pořád říká „static site“.                                            |

### Není

- Online přihláška (modely `Registration`, `RegistrationLine`, `Payment` existují).
- Admin / CMS / auth (legacy `User` má 8znakové plaintext heslo — **nesmí** se použít jako produkční auth).
- Napojení `News`, `WebImage` (mimo test endpoint), `Sponsor`.
- Stránka fotogalerie, stránka běžce, startovní listina pro veřejnost.
- Živý termín / počasí ročníku na homepage (termín je JSON „Neděle 6. prosince“).
- Testy.
- Produkční deploy dokumentovaný (k8s probes jsou, Dockerfile je, orchestrace ne).

---

## 7. Databáze

Schéma: `prisma/schema.prisma`. Mapování `@@map` na legacy MySQL názvy. Zdroj: `docs/sql_create.sql`. Seed data číselníků: `docs/sql_pl_data.sql` + `prisma/seed.ts`.

Klient: `src/lib/db/client.ts` — Prisma 7 driver adapter, singleton na `global.prisma`.

### Modely

| Prisma             | Tabulka                | Použití ve webu                                              |
| ------------------ | ---------------------- | ------------------------------------------------------------ |
| `Category`         | `cis_mcvv_kateg`       | výsledky, seed                                               |
| `Runner`           | `cis_bezec`            | relace; rok narození se bere jako `runnerId.substring(0, 4)` |
| `PhotoAuthor`      | `cis_fotka_autor`      | seed; relace na Photo je zakomentovaná                       |
| `PhotoLocation`    | `cis_fotka_kde`        | seed, relace Photo                                           |
| `Club`             | `cis_klub`             | composite PK `(id, year)`                                    |
| `WebImageType`     | `cis_typ_webimages`    | seed                                                         |
| `Edition`          | `mcvv_info`            | datum/počasí/teplota na `/results*`                          |
| `Photo`            | `mcvv_fotky`           | galerie (BLOB `Bytes`)                                       |
| `RunnerPhoto`      | `mcvv_bezec_fotka`     | nepoužito v UI                                               |
| `News`             | `mcvv_news`            | nepoužito                                                    |
| `WebImage`         | `webimages`            | jen `/api/test/webimage`                                     |
| `Registration`     | `mcvv_prihlaska`       | nepoužito v UI                                               |
| `RegistrationLine` | `mcvv_prihlaska_radek` | nepoužito v UI                                               |
| `Payment`          | `mcvv_platba`          | `registrationId` je `Char(3)`, **bez FK**                    |
| `StartEntry`       | `mcvv_start`           | mapování bib → mezičasy                                      |
| `Result`           | `mcvv_time`            | časy v sekundách                                             |
| `Split`            | `mcvv_split`           | mezičasy; split `"9"` se na archivu zahazuje                 |
| `User`             | `users`                | legacy admin, plaintext                                      |
| `Sponsor`          | `sponsors`             | nepoužito v UI                                               |

Seed **neplní** výsledky, fotky, ročníky, kluby, běžce. To musí přijít importem ze starého webu. `docs/notes.md` to má jako starý TODO (schéma + seed z SQL) — schéma a číselníky už jsou, zbytek insertů ne.

Mezičasy na `/results`: split `"1"` = Mezičas 1, `"3"` = Mezičas 2.

---

## 8. Routy

Veřejné (locale prefix):

| URL                               | Zdroj         | Poznámka                        |
| --------------------------------- | ------------- | ------------------------------- |
| `/cs`, `/en`                      | JSON + Prisma | `force-dynamic`                 |
| `/cs/program`                     | JSON          |                                 |
| `/cs/results?year=&view=&splits=` | Prisma        | view `categories` \| `absolute` |
| `/cs/results/2025`                | Prisma        | `notFound()` bez dat            |

Interní / dluh:

| URL                                      | Účel                                                                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `/api/test/fotka?id=`                    | Servíruje BLOB z `mcvv_fotky`. **Produkčně používané** galerií, přesto `test` v cestě. Povolené v `next.config.ts` `images.localPatterns`. |
| `/api/test/webimage`                     | Ověření importu `webimages`.                                                                                                               |
| `/test`, `/test/fotka`, `/test/webimage` | Dev stránky, bez locale, bez auth.                                                                                                         |

Assety:

- `public/images/hero.jpg`, `runner-climb.jpg`
- `public/illustrations/{trail,topographic,wilderness}-map.jpg`
- `public/images/elevation-profile.jpg` — untracked, nepoužito

---

## 9. Copy a věcné nesrovnalosti

Ročník v copy: **neděle 6. 12. 2026**. Trať **4,3 km**, **200 m** převýšení, **4 kopce**, start u Velké Verandy, hlavní start **11:00**.

Rozpory, které analytik musí vyřešit s vlastníkem (nehádat):

| Téma            | Homepage                                     | Program                                                        |
| --------------- | -------------------------------------------- | -------------------------------------------------------------- |
| Centrum / start | „Restaurace Velká Veranda, Choceň 565 01“    | „Sokolovna Choceň — Tyršovo náměstí 1“; start ~300 m od centra |
| Dětský start    | Info karta: od **10:00**                     | Sekce Datum: od **9:30**                                       |
| Převýšení       | „200 m“ (po úpravě profilu)                  | Header meta pořád „200 m+“                                     |
| Startovné       | 200 Kč předem / 300 Kč na místě, děti zdarma | Stejně; v DB kategoriích je ale `entryFee` 50/100 Kč (legacy)  |

Další placeholdery:

- Kontaktní telefon a mail (i hardcoded mailto).
- Partneři.
- Countdown.
- JSON vítězi 2023–2025 (`Jan Novák`, `Eva Dvořáková`…) — překryje je DB.
- Footer copyright `© 2026`.

Profil: min **286 m n. m.**, max **343 m n. m.**, 4 označené kopce. Osa: START, 1–4 km, CÍL · 4,3 km.

---

## 10. Známý tech dluh (pro revize)

1. **Galerie tahá BLOBy v RSC** — homepage načte až 60 full image blobů jen kvůli detekci portrait. Špatné pro latency i RAM.
2. **`/api/test/fotka` v produkční cestě** — přejmenovat na stabilní image route, cache headers.
3. **Výsledky `/results` vs `/results/[year]`** se překrývají; archive page je ~500 řádků, hodně duplicity, hardcoded CS.
4. **PDF font z CDN** třetí strany.
5. **`Math.random()` na serveru** v `page.tsx` (eslint `react-hooks/purity` vypnutý komentářem) — galerie se mění každý request.
6. **Countdown a termín** nejsou odvozené z `Edition`.
7. **Dockerfile** neřeší Prisma generate / engine v runtime jasně.
8. **Prázdné** `src/lib/api`, `src/lib/date`, `src/lib/types`.
9. **`docs/best-practices.md`** pořád „Next Starter Boilerplate“.
10. **`docs/notes.md`** je osobní cheat-sheet (včetně `git add .` + push) — nebrat jako proces.
11. **i18n děravé** na výsledkových stránkách a PDF.
12. **Next `<Image>` `sizes`** u galerie je v working tree, ne v commitu — bez toho Next varuje.

---

## 11. Pravidla repo (pro briefy vývojářům)

Z `AGENTS.md` / `CLAUDE.md` (aktualizované lokálně):

- Alias `@/` = `src/`.
- Prisma jen z `@/lib/db/client`.
- Env jen z `@/lib/env`.
- Navigace z `@/i18n/routing`.
- Při změně copy editovat **cs i en** a typ v templates.
- Výsledky/fotky **netahat do JSON**.
- shadcn v `components/ui` nesahej.
- Node 24.15.0, pnpm 11.4.0.
- UI změny ověřit v prohlížeči (desktop + mobile), ne jen screenshot.

---

## 12. Navrhované workstreamy (návrh, neschváleno)

Seřaď a odsouhlas s vlastníkem. Neimplementuj z tohoto seznamu samo od sebe.

### A. Uzavření working tree

- Commit `docs: describe MCVV as a dynamic Prisma app`.
- Commit `fix: add Next Image sizes on gallery`.
- Rozhodnout o `dumps/` (gitignore) a smazat/necommitovat `elevation-profile.jpg`.

### B. Pravda o ročníku 2026

- Sjednotit místo (Veranda vs sokolovna), časy dětí, převýšení 200 vs 200 m+.
- Ověřit kontaktní údaje.
- Countdown z reálného data (první prosincová neděle / `Edition.date`).
- Partneři z DB nebo reálné názvy.

### C. Přihlášky (největší produktový kus)

- Schéma legacy přihlášek už je; UX, platby, kapacity, mail, bezpečnostní kód, stav — **není**.
- CTA dnes lžou (scroll na prázdný blok). Buď formulář, nebo dočasně změnit copy na „sledujte termín“ / odkaz na e-mail.
- `Payment.registrationId Char(3)` je past při návrhu.

### D. Výsledky — kvalita

- Vytáhnout společný renderer archive vs. year.
- Doplnit i18n.
- Stabilní PDF font (self-host DejaVu).
- Sitemap ročníků.

### E. Média

- Produkční image route místo `/api/test/*`.
- Nečíst 60 blobů na homepage (orientace v metadatech / sloupec / on-the-fly jen ID).
- Test stránky `/test/*` pryč z produkčního tree nebo za `NODE_ENV`.
- Až bude potřeba: archiv fotek podle roku a `PhotoLocation`.

### F. Produkce

- Domain v sitemap (`mcvv.cz`?).
- `robots.txt`.
- Dockerfile + env na hostingu.
- Health/readyz případně kontrola DB.

### G. Admin (později)

- Nesmí stavět na tabulce `users` (plaintext). Nový auth stack.
- Správa ročníku, import výsledků, sponzoři, news.

---

## 13. Jak dál pracovat jako analytik

1. Na začátku session přečti tento soubor + `git status` + `git log -5`. Working tree se mohlo pohnout.
2. Než navrhneš vývoj, **ověř s vlastníkem prioritu** (typicky: pravda v copy vs. přihlášky vs. úklid test rout).
3. Brief pro vývojový agent drž malý: soubory, akceptační kritéria, co nesahat (profil tratě, dokud to neřekne).
4. Po implementaci revize: cs/en parity, Prisma vs. JSON, mrtvé CTA, mobile, `pnpm lint && pnpm format:check`.
5. Commituj focused; **push jen na výslovný pokyn**.

### Soubory, které číst první

- `src/app/[locale]/page.tsx` — homepage data
- `src/app/[locale]/results/page.tsx` — archiv
- `src/app/[locale]/results/[year]/page.tsx` — ročník + PDF
- `prisma/schema.prisma`
- `src/i18n/locales/cs/common.json` (+ en)
- `src/components/organisms/mcvv-profile-section.tsx` — hotový profil
- `README.md` / `CLAUDE.md` (lokálně aktuálnější než remote)

### Co nečíst jako zdroj pravdy

- `docs/notes.md` (osobní TODO, částečně splněné)
- JSON vítězi 2023–2025 (dummy)
- Partner names, telefon, countdown
- Remote `CLAUDE.md` („static site“) — platí lokální working copy
