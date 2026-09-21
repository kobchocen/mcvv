# Příprava nasazení MCVV

## Aplikační příkazy

Použít Node `24.15.0` a Corepack s `pnpm@11.4.0`.

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm lint
pnpm format:check
pnpm build
pnpm test:integration
```

`postinstall` generuje Prisma Client; po změně schématu použít `pnpm db:generate`. Build nevyžaduje `DATABASE_URL`
ani běžící databázi. Next.js vytváří `.next/standalone/server.js`; existující
`next/font/google` během buildu potřebuje přístup ke Google Fonts.

Dockerfile má cíle `migration` a `runner`. První obsahuje Prisma CLI, klienta,
schema a migrace, druhý pouze standalone server a statické soubory. Oba běží pod
uživatelem `node`. Build ani spuštění webu nespouští migrace. Docker kontext
vylučuje lokální konfiguraci, klíče a data z `docs/`.

```bash
docker build --target migration -t mcvv:migration .
docker build --target runner -t mcvv:web .
```

## Databáze a TLS

`DATABASE_URL` je prosté `mysql://` URL bez query parametrů. Uživatelské jméno,
heslo a název databáze se dekódují z URL. Migrace a runtime používají stejnou
TLS politiku, dokumentovanou také v `.env.example`:

- `NODE_ENV=production`: TLS je povinné; `DATABASE_TLS=false` skončí chybou.
- V development/test lze TLS zapnout pomocí `DATABASE_TLS=true`.
- `DATABASE_SSL_CA` je volitelná cesta k důvěryhodnému CA bundle. Jinak runtime
  používá výchozí CA certifikáty Node. CA musí být přístupná i migračnímu jobu.
- Runtime vyžaduje TLS 1.2 nebo novější, ověřuje CA i hostname a nikdy nevypíná
  `rejectUnauthorized`. Totéž ověření hostname platí i při připojení přes IP.
- `db:migrate` připraví dočasný CA bundle pro Prisma CLI a nastaví `sslcert`
  a `sslaccept=strict`. Dočasný soubor odstraní po ukončení. Produkční MySQL
  musí navíc vynucovat `require_secure_transport=ON` a TLS 1.2 nebo novější.

`pnpm db:migrate` spouští `prisma migrate deploy` se zámkem a historií
`_prisma_migrations`. Aplikuje verzované SQL migrace a nepoužívá seed/reset.
Neúspěch skončí nenulovým kódem; výstup neobsahuje přihlašovací údaje.

`pnpm db:check` ověřuje SELECT a skutečně vyjednané TLS na stejné session,
úspěšné migrace včetně SHA-256 checksumů proti danému vydání a čitelnost všech
tabulek/sloupců v generovaném schématu. Nic nezapisuje. Kontrolu po migraci
spustit s **aplikačním účtem**. Infrastrukturní `scripts/migrate.sh` už přepíná
`DATABASE_URL` z migračního účtu na `RUNTIME_DATABASE_URL` před `db:check`.

`GET /healthz` vrací HTTP 200, prosté `ok` a `Cache-Control: no-store` bez DB
spojení. `GET /readyz` vrací 200 při dostupné databázi, jinak obecné 503; čeká
nejvýše dvě sekundy. Chyby ani konfiguraci v odpovědi nezveřejňuje.

## Trvalá data a integrační ověření

Audit zdrojů z 8. 9. 2026: aplikační data a fotografie jsou v MySQL, obrázky
v tabulkách `mcvv_fotky` a `webimages` jako LONGBLOB. Nebyly nalezeny serverové
zápisy uploadů či jiných trvalých souborů. Theme preference je v localStorage
prohlížeče; image cache Next.js je lokální obnovitelná cache. Stránky s daty
z DB používají dynamické renderování; nebylo nalezeno sdílené ISR/session úložiště.

`pnpm test:integration` vyžaduje Docker daemon, Python 3 a OpenSSL. Vytvoří
unikátně pojmenované testovací image, síť, kontejnery a volume, žádnou existující
databázi nepoužívá. Po skončení odstraní pouze své zdroje. Testuje:

- Build runtime i migračního image a generovaného Prisma klienta.
- MySQL 8.4 s vynuceným TLS, vlastní testovací CA a certifikátem `mysql.test`.
- Odmítnutí prázdného schématu, dvojí bezpečné spuštění migrací a `db:check`.
- Odmítnutí nesprávného hostname a nedůvěryhodné CA u runtime i Prisma migrací.
- Zápis a přečtení fotografie s 80 kB blobem po nahrazení MySQL kontejneru
  při zachování volume; klient pro čtení je nový proces v novém kontejneru.
- `/healthz` a `/readyz` ve skutečném standalone image, včetně výpadku DB.

SQL migrace používá MySQL kolaci `utf8mb4_unicode_ci` a standardní cizí klíče.
Příznak `mysql_compatible` se smí potvrdit až po průchodu integračního testu;
statická kontrola SQL sama kompatibilitu nepotvrzuje.

## Vydávání a ověření

Automatické verzování, větve, ACR, Helm, oprávnění a obnova jsou popsány v
[APPLICATION-DELIVERY.md](APPLICATION-DELIVERY.md).

Dodaný GitHub CI log potvrzuje úspěšný standalone build obou Docker image, ale
následná databázová migrace selhala. Oprava nyní používá skutečný Prisma CLI
entry point `prisma/build/index.js`; test ho spouští bez přihlašovacích údajů.
Úspěch celé MySQL/TLS/perzistenční integrace je stále potřeba potvrdit novým
během CI. Auditové příznaky infrastruktury proto zůstávají nepotvrzené.
