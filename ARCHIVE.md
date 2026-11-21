# Archiv: integrace OBD (LuM) a OFeed

Tato větev (`archive/obd-ofeed`) a anotovaný tag `archive-obd-ofeed-2026-11` zachycují **poslední stav aplikace MCVV s integracemi na OBD (časomíra LuM) a OrienteerFeed (OFeed)** před jejich odstraněním z `develop`.

- Základ: `develop` @ `bd4664e` (21. 11. 2026, po PR #311, PROD v té době 1.15.1).
- Větev ani tag se **nikdy nemergují** zpět. Slouží jen jako záloha pro případné obnovení.
- Důvod odstranění: od 4. 11. 2026 (Q421) se OBD nahrazuje vlastním měřením ve webové aplikaci (#252). Výsledky se už neimportují z OBD, vznikají z vlastních dat a zveřejňuje je hlavní rozhodčí. OFeed nahradily vlastní online výsledky, speaker a resultboard.
- Binárka klienta OBD pro Windows zůstává v GitHub release [`obd-klient-v0.2.0`](https://github.com/kobchocen/mcvv/releases/tag/obd-klient-v0.2.0).

## Co archiv obsahuje

### OFeed (#122, #127, Q33, Q119)

- `src/lib/ofeed/**`: IOF XML 3.0 ResultList (`iof-xml.ts`, `fixtures/IOF.xsd`), klient OFeed API, publisher s lease a otiskem (`publisher*.ts`), plánovač asi 30 s (`scheduler.ts`), nastavení se dvěma profily live/test (`settings*.ts`), šifrování hesla akce (`secret-box.ts`, AES-256-GCM z `SESSION_SECRET`).
- API: `src/app/api/admin/ofeed/xml/route.ts`, `src/app/api/cron/ofeed/route.ts` (Azure cron ji nevolal).
- Admin: sekce OFeed v `/admin/den-zavodu/zive`, akce `saveOfeedAction`, `switchOfeedProfileAction` a ruční publikace v `src/lib/live/admin-actions.ts`.
- Napojení: `src/instrumentation.ts` (start plánovače), úvodní stránka a `/vysledky` (`onlineResultsOverrideUrl`), pojistka testovacího běhu #186 (test jen s testovací akcí OFeed), `OFEED_STATE.lastHash` v `live/test-run.ts` a `live/clear.ts`.
- Env: `OFEED_API_URL`, `OFEED_DRY_RUN`, `OFEED_SCHEDULER`.

### Klient OBD a příjem dat (#120, Q22, Q72)

- `tools/obd-klient/` (Go, Windows): čte `splits.csv` z OBD a posílá časy na API.
- CI: job `obd-klient` v `.github/workflows/ci.yml`, release workflow `.github/workflows/obd-klient-release.yml` (tag `obd-klient-v*`).
- API `src/app/api/race/[rok]/splits/route.ts` (klíč zařízení, epocha dat), `src/lib/live/tokens*.ts`, `src/components/organisms/mcvv-admin-token-form.tsx`.
- `applyDeviceItems`, `decideDeviceWrite`, `decideDeviceDelete` v `src/lib/live/ingest*.ts`, `dataEpoch` v `live/test-run-core.ts`, revokace klíčů v `live/test-run.ts` a `live/clear.ts`, filtr zdroje OBD v `/admin/den-zavodu/zive/casy`.

### Export pro OBD – prihl2obd (#117)

- `src/lib/raceday/obd-export*.ts`, `src/app/api/den-zavodu/obd-export/route.ts`, `src/lib/encoding/windows-1250.ts` (enkodér), fixtures `src/lib/raceday/__fixtures__/obd-synthetic.*`, sekce „Export pro OBD“ na hubu `/admin/den-zavodu`.

### Importy z OBD (#119, #123, #129)

- Import prezentace (`cis_bezec.csv`, `cis_klub.csv`, `start.csv` → `mcvv_start`): `/admin/den-zavodu/prezentace`, `presentationImportAction`.
- Import oficiálních výsledků `kon_vysl.csv` → `mcvv_time` + přepočet rekordů: `/admin/den-zavodu/vysledky`, `resultsImportAction`.
- Společné: `src/lib/raceday/obd-csv.ts`, `obd-import.ts`, `obd-import-data.ts`, `import-actions.ts`, `import-view.ts`, `import-form-labels.ts`, `src/components/organisms/mcvv-raceday-import-form.tsx`, namespace `RaceDayImport` v překladech.

### Dokumentace

- `docs/DEN-ZAVODU-MEZICASY.md` (API zařízení, klient OBD, OFeed, generálka, testovací běh).

## Související issues a rozhodnutí

#117, #119, #120, #122, #123, #125, #127, #129, #131, #186, #252. Rozhodnutí Q22 (první zapsaný čas), Q33 (profily OFeed), Q72 (epocha pro klienta), Q119 (OFeed jako záloha), Q197 (souběh s OBD), Q421 (OBD se nahrazuje).
Odstranění na `develop`: PR „Úklid: odstranění integrací OBD a OFeed“ (feature/cleanup-obd-ofeed) a navazující PR (startovka jako jediný zdroj, oficiální výsledky). Odkazy jsou v issue „Archiv OBD/OFeed“.

## Stav databáze při archivaci

Odstraňuje se jen kód. **Tabulky a data zůstávají** (žádná migrace v úklidových PR):

- `mcvv_ingest_token` (klíče zařízení pro klienta OBD),
- `mcvv_split_entry.source` (hodnoty `web`/`obd`) a `mcvv_split_entry.token_id`,
- `mcvv_setting`: `ofeed_enabled`, `ofeed_profile`, `ofeed_event_id`, `ofeed_password_enc`, `ofeed_password_set_at`, `ofeed_test_event_id`, `ofeed_test_password_enc`, `ofeed_test_password_set_at`,
- `mcvv_job_state`: `ofeed_lease`, `ofeed_last_hash`, `ofeed_last_ok_at`,
- enum `mcvv_user.role` s hodnotou `timing`,
- `mcvv_start` a `mcvv_time` nejsou OBD tabulky, jsou to archiv startovek a výsledků všech ročníků.

Úklid DB (smazání `mcvv_ingest_token` a řádků `ofeed_*`) je plánovaný až po závodě 6. 12. 2026 v samostatném PR. Když bude obnova potřeba dřív, tabulky existují.

## Jak vrátit

**Celé** (obnovit stav před úklidem): na `develop` udělat `git revert -m 1 <merge commit úklidového PR>` (a případně navazujících PR), otestovat a vydat obvyklým release postupem.

**Částečně** (jen jednu integraci):

```bash
git checkout archive-obd-ofeed-2026-11 -- src/lib/ofeed src/app/api/admin/ofeed src/app/api/cron/ofeed   # OFeed
git checkout archive-obd-ofeed-2026-11 -- tools/obd-klient .github/workflows/obd-klient-release.yml 'src/app/api/race/[rok]/splits' src/lib/live/tokens.ts src/lib/live/tokens-core.ts src/lib/live/tokens-core.test.ts src/components/organisms/mcvv-admin-token-form.tsx   # klient OBD
git checkout archive-obd-ofeed-2026-11 -- src/lib/raceday src/app/api/den-zavodu 'src/app/[locale]/admin/den-zavodu/prezentace' 'src/app/[locale]/admin/den-zavodu/vysledky' src/components/organisms/mcvv-raceday-import-form.tsx src/lib/encoding   # export a importy
```

Pak ručně obnovit napojení (porovnat s tagem: `git diff archive-obd-ofeed-2026-11 -- <soubor>`):

- `src/instrumentation.ts`,
- `src/lib/env.ts` a `.env.example`,
- `src/lib/live/{admin-actions,ingest,ingest-core,clear,clear-core,test-run,test-run-core,test-run-actions}.ts`,
- `src/app/[locale]/admin/den-zavodu/page.tsx`, `zive/page.tsx`, `zive/casy/page.tsx`,
- úvodní stránka a `/vysledky`,
- `next-intl.config.ts`, `src/lib/auth/login-next.ts`, `src/lib/audit/log.ts`,
- překlady `src/i18n/locales/*/common.json`, job `obd-klient` v `.github/workflows/ci.yml`.

Pro klienta OBD je dál potřeba vytvořit klíč zařízení v adminu. Pro OFeed znovu zadat ID akce a heslo, protože heslo je šifrované přes `SESSION_SECRET`.
