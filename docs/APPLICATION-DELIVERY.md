# Automatické vydávání MCVV

`package.json` je jediný zdroj aplikačních příkazů. Aplikace nemá Makefile;
infrastrukturní Make ovládá samostatný životní cyklus Azure. Nevytvářet další
Make aliasy pro pnpm. Databázové příkazy mají jednotný prefix `db:`.
Prisma klient vzniká jednou v `postinstall`; po změně schématu použít `db:generate`.
`build` klienta zbytečně negeneruje a Docker neopakuje unit testy z CI.

Aktuální důkazy a omezení ověření jsou v [DELIVERY-VALIDATION.md](DELIVERY-VALIDATION.md).

## Větve, commity a verze

| Větev                                                                                             | Výsledek releasovatelné změny                    | Nasazení                   |
| ------------------------------------------------------------------------------------------------- | ------------------------------------------------ | -------------------------- |
| `feature/*`, `bugfix/*`, `refactor/*`, `docs/*`, `chore/*`, `test/*`, `ci/*`, `build/*`, `perf/*` | PR a CI                                          | žádné                      |
| `develop`                                                                                         | `v1.2.0-develop.1`                               | staging                    |
| `release/v1.2.0`                                                                                  | `v1.2.0-rc.1`                                    | pouze kandidát a artefakty |
| `main`                                                                                            | `v1.2.0`                                         | production                 |
| `hotfix/*`                                                                                        | oprava přes PR do main, následně zpět do develop | až po vydání na main       |

Pravidla vycházejí z Daxaris `cpf/shared/coding-standards/git-conventions.md`.
Commity jsou anglicky v Conventional Commits: `feat(results): add year filter`,
`fix(db): resolve migration CLI`, `refactor(ui): extract footer`.
`feat` znamená minor, `fix`/`perf` patch, `!` nebo `BREAKING CHANGE:` major.
Také `refactor`, `build` a `ci` vydávají patch; samotné `docs`, `test`, `style`
a běžné `chore` verzi nezvyšují. Čísla určuje semantic-release, nikoliv ruční
úprava package.json nebo štítek PR. `Refs: ABC-123` lze použít pro vazbu na požadavek.
Dependabot je explicitní automatizační výjimka s prefixem `dependabot/*`, cílem
develop a commity `build(deps): ...`. Commitlint běží v commit-msg hooku a nad rozsahem commitů PR v CI.

Pracovní větve zakládat z develop a vracet do develop. Po stabilizaci vytvořit
z develop `release/vX.Y.Z` podle očekávané následující stabilní verze. Název
release větve sám číslo nevynucuje: plugin odmítne nesoulad s výpočtem semantic-release.
V jednu chvíli smí existovat **jen jedna aktivní `release/*` větev**, protože
sdílejí prerelease identifikátor `rc`. Opravy RC vracet také do develop.
Release PR sloučit do main se zachováním historie (merge commit, nikoli squash
celé release větve); potom sloučit main zpět do develop a release větev odstranit.
Tím se přenesou release tagy i výchozí stabilní verze. Produkce přijímá pouze
release/_ a hotfix/_; přímý PR develop → main kontrola odmítne.

První vydání bez existujícího semantic-release tagu začíná `1.0.0`
(resp. `1.0.0-develop.1`), i když lokální výchozí package má `0.1.0`.
Tagy mají standardní tvar **`vX.Y.Z`**, například `v1.2.3`.

## Co workflow vytvoří

`ci.yml` je znovupoužitelná kontrola: frozen install + Prisma generate, `verify`
(lint, Prettier, typy, testy, konzistence verzí a větví), commitlint pro PR,
Helm lint/render a skutečná Docker/MySQL/TLS integrace. Push do develop, main
nebo release větve spouští tuto kontrolu přes `release.yml`; publikace navazuje
na její úspěch. PR nepotřebuje Azure ani release tokeny.

`release.yml` spočítá verzi, zapíše `package.json`, `Chart.yaml`
(`version` i `appVersion`) a `src/lib/build-info.json`. Zápatí a `/api/version`
ukazují stejnou verzi a build `GITHUB_RUN_NUMBER.GITHUB_RUN_ATTEMPT`.
Metadata jsou součástí buildu, nikoliv měnitelná runtime proměnná.

Z připnutého infrastrukturního commitu použije Dockerfile, migrační obal
`migrate.sh` a autentizační gateway. Zachovává tím ochranu stagingu.
Publikuje do `<ACR_NAME>.azurecr.io`:

- `web/prod:1.2.3`, `migration/prod:1.2.3` a po GitHub Release také aliasy `latest`;
- `web/stg:1.3.0-develop.1`, `migration/stg:1.3.0-develop.1`;
- `web/rc:1.3.0-rc.1`, `migration/rc:1.3.0-rc.1`;
- OCI Helm chart `helm/mcvv:1.2.3` (resp. prerelease verze).

Verzované tagy workflow nikdy nepřepisuje. `latest` patří jen stabilním vydáním;
neznamená potvrzení úspěšného nasazení. Nasazování používá výhradně digesty.
Registry musí zachovávat referencované release manifesty a image.

GitHub Release a Actions artefakt obsahují `mcvv-X.Y.Z.tgz`, `release.json`,
`values.json` a `SHA256SUMS`. Manifest uvádí zdrojový commit, build, verzi,
prostředí, infrastrukturní commit a digesty obou image i chartu.
Semantic-release aktualizuje CHANGELOG a vytvoří release commit s `[skip ci]`
a tag. Běžné commity bez releasovatelné změny nevytvoří image ani deploy.

Aplikační workflow požádá infrastrukturní `deploy-release.yml` o nasazení tagu.
Ten ověří checksum manifestu, aktuální HEAD aplikační větve proti tagu, parent
release commitu proti zdroji buildu, shodu metadat a scope ACR image.
Přes existující `platform.py` provede migraci, nasazení hotových digestů a smoke test.
Zůstává společný infrastrukturní zámek `platform-mutations`. Zastaralý požadavek
se odmítne. Aplikační běh pouze potvrzuje odeslání požadavku; výsledek nasazení
je v infrastrukturním běhu. Vydání RC staging nepřepíná.

## Jednorázové nastavení GitHub a Azure

1. Nechat projít `pnpm verify`, `pnpm chart:check`, `pnpm build` a kompletní
   `pnpm test:integration`. Teprve podle výsledku potvrdit
   v infrastrukturním `config/application.json` `audited`, `mysql_compatible`
   a `persistent_writes: "none-or-external"`. Automatizace tento audit neobchází.

2. Přenést připravenou změnu do sousedního checkoutu a zkontrolovat diff:

   ```bash
   python3 delivery/install-infra.py --target ../chc-azure-terraform
   ```

   Pak publikovat infrastrukturní změny včetně `.github/workflows/deploy-release.yml`,
   `scripts/release-source.py` a oprav build kontextu/Dockerfile. Zdroj nové části
   je v aplikačním `delivery/infra/`. Dockerfile musí mít OpenSSL/CA certifikáty
   a build kontext musí podporovat checkout v `.local/infra`.

3. Dokončit bootstrap Azure podle původního infrastrukturního návodu: ACR, MySQL
   s TLS, migrační/runtime účty, secrets, Container Apps, DNS a OIDC identity.
4. V aplikaci vytvořit GitHub environments `production`, `staging`, `release`.
   Povolit příslušně main, develop, release/\* a OIDC federaci se subjecty
   `repo:kobchocen/mcvv:environment:<environment>`. Pro plně automatický provoz
   nenastavovat manuální environment approval. U běžného ACR release identity
   stačí `AcrPush` (u ABAC registry ekvivalentní repository writer + catalog list).
   Infrastruktura používá vlastní existující OIDC identity a oprávnění.
5. Nastavit aplikační repository/environment variables a secrets podle tabulky.
6. V infrastruktuře nastavit environments production/staging, `ACR_NAME`,
   `INFRA_CONFIG_JSON`, Azure identifikátory a `APPLICATION_READ_TOKEN`.
7. Na develop/main/release větvích vyžadovat úspěšný CI check a PR. Pro release
   bota povolit zápis release commitu do chráněných větví a vytváření `v*` tagů.
   Pokud pravidla vyžadují podepsané commity, připravit také podpis bota.
   Přímé lidské pushování do chráněných větví zakázat; skript nenahrazuje GitHub
   branch protection. Názvy checks převzít z prvního skutečného běhu reusable CI.

| Nastavení v aplikaci                                          | Účel                                                            |
| ------------------------------------------------------------- | --------------------------------------------------------------- |
| `INFRA_REPOSITORY`                                            | např. `kobchocen/chc-azure-terraform`                           |
| `INFRA_BUILD_REF`                                             | přesný publikovaný 40znakový commit infrastruktury, povinný     |
| `ACR_NAME`                                                    | existující registry bez `.azurecr.io`                           |
| `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` | OIDC pro publikaci do ACR                                       |
| `PUBLIC_BUILD_ENV_JSON`                                       | pouze veřejné NEXT*PUBLIC*\* řetězce, výchozí `{}`              |
| secret `INFRA_READ_TOKEN`                                     | pouze infrastruktura, Contents: read, privátní checkout         |
| secret `INFRA_DEPLOY_TOKEN`                                   | pouze infrastruktura, Actions: write, workflow dispatch         |
| secret `RELEASE_TOKEN`                                        | pouze mcvv, Contents: write; bot s výjimkou pro release commity |

Bez ochrany větví lze použít výchozí GITHUB_TOKEN; s ochranou potřebuje release
bot oprávnění a výjimku v rulesetu. Tokeny patří do GitHub Settings, nikoliv do git
souborů nebo konverzace. Infrastrukturní APPLICATION_READ_TOKEN smí mít pouze
mcvv / Contents: read (tagy, zdroje a release assets).

## Helm a trvalá data

Produkční automatické nasazení zatím používá **Azure Container Apps**. Chart
je verzovaný distribuční artefakt pro existující Kubernetes; tento repozitář
nezřizuje AKS. `.helmignore` vylučuje lokální soubory a secrets.

Pro instalaci chartu předem vytvořit namespace a existující secret zvolený
v `databaseSecret` s klíči `DATABASE_URL` a `MIGRATION_DATABASE_URL`, případně
`caSecret` s `ca.crt`. Staging potřebuje `stagingSecret` s `STAGING_BASIC_PASSWORD`.
Zajistit ACR pull identitu nebo `imagePullSecrets`. Migrační pre-install/pre-upgrade
hook spustí migrace a kontrolu aplikačním účtem; nevytváří databázi ani účty.
Připojit stažené `values.json` s digesty. Ingress je volitelný a potřebuje vlastní
hostname/TLS secret. Chart očekává image s infrastrukturní gateway, ne lokální
Docker target runner.

Fotografie a data patří do MySQL; kontejner není trvalé úložiště. Chart proto
nepřidává PVC. Next.js image cache je obnovitelná. DB migrace musejí být kompatibilní
s předchozí verzí při rollout/rollback (expand/contract).

## Obnova po přerušeném vydání

Publikace do GitHub a ACR není jedna transakce. Pokud se proces přeruší po pushi
image a před tagem, další pokus odmítne přepsat existující verzi. Operátor musí
ověřit, že osiřelé image/chart nejsou nasazené nebo referencované vydáním, a vyřešit
je v ACR před opakováním. Automatický skript je nemaže.

Pokud už GitHub Release existuje, znovu spustit potřebný infrastrukturní
`deploy-release.yml` s existujícím tagem a prostředím; pořád musí být aktuálním
HEAD aplikační větve. Starší vydání obnovovat existujícím infrastrukturním rollback
postupem podle digestu. Opakovaný semantic-release bez nových commitů sám zmeškaný
dispatch neobnoví. Tagy ani historii vydání nepřepisovat.
