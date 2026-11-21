# Den závodu: mezičasy a online výsledky

Issues #120, #121, #127. Nahrazuje MRB a FTP upload z legacy webu.

```text
operátor 1,3 / 2,7 km / cíl ─▶ /mezicasy (web, offline fronta) ─▶ POST /api/live/splits
                                                                        ▼
                                                 mcvv_split (+ deník mcvv_split_entry)
                                                                        ▼
                               speaker, výsledková tabule, veřejné online výsledky (/vysledky/online)
```

Integrace s OBD (LuM: klient `obd-klient`, API `/api/race/{rok}/splits`, export prihl2obd,
import `kon_vysl.csv`) a publikace do OFeed byly odstraněny (listopad 2026). Kód je v archivu:
tag `archive-obd-ofeed-2026-11`, větev `archive/obd-ofeed` (návod na obnovu v `ARCHIVE.md`).
Import po prezentaci z OBD zmizel také: startovka je jediná a bere se přímo z přihlášek.

## Startovka (jediný zdroj)

- `src/lib/race/roster.ts` (`loadRoster`, `rosterHasBib`): řádek přihlášky s číslem
  (`mcvv_prihlaska_radek.cislo > 0`) na **zaplacené** přihlášce (`isEntryValid` – nezrušená,
  s běžci, zaplacená / potvrzená pořadatelem / 0 Kč). Nezaplacená přihláška do startovky nepatří,
  ani když má číslo.
- Čtou ji: veřejná startovka a PDF, tisk čísel, úvodní stránka, Start (startér, kontrola startu,
  `autoMarkStart`), příjem mezičasů (`unknown-bib`), ruční časy, speaker, online výsledky,
  tombola a mezičasy ve výsledcích.
- `mcvv_start` je jen archiv ročníků do 2025 (`ROSTER_SINCE = 2026`), nic do něj nezapisuje.
- Potvrzení losování ve Startovce (uložení návrhu) startovku hned zveřejní
  (`startlist_drawn_year` + `startlist_published` v `mcvv_setting`). Přepínač v nastavení je jen
  nouzové skrytí; potvrzené losování (zámek generátoru, čísla pro zaplacené pozdní přihlášky)
  skrytí neruší. Po losování žádné storno – čísla zůstávají obsazená.

## Data

- `mcvv_split` zůstává 1:1 s legacy (`cislo, rok, split, time, created, autor`, PK `cislo+rok+split`).
  Úseky: `1` = 1,3 km, `3` = 2,7 km, `9` = cíl. `time` = sekundy od individuálního startu.
- Start: nula ročníku (`raceStartFor`, 10:15) nebo „zkušební nula“ z `/admin/den-zavodu/zive`
  (generálka), interval 15 s, čísla > 600 jsou druhá vlna (`n' = číslo − 600`). Lokální helper
  `src/lib/live/start-time.ts` se nahradí výpočtem z #114.
- `mcvv_split_entry` je deník všech zápisů (web, admin; historicky i OBD): unikátní
  `entry_key` = idempotence,
  `outcome` = `applied | duplicate | unchanged | conflict | resolved | rejected | replaced | deleted`.
- `mcvv_ingest_token` = klíče zařízení pro OBD (dnes nepoužívané, tabulka zůstává kvůli historii).
- Migrace `20261021040000_live_splits` jen přidává dvě tabulky.

## Web klient `/mezicasy` (#121)

- Přístup: role `splitmaker`, `organizer`, `admin` (`canAccessSplits` v `@/lib/auth/roles`, #112).
  Ostatní (včetně `timing`) vidí „nemáte oprávnění“. Nepřihlášený jde na přihlášení s
  `next=/mezicasy` a po přihlášení se vrátí sem. Správa (`/admin/den-zavodu/zive`) jen admin (`canManageLiveResults`); odkaz na ni je v hubu `/admin/den-zavodu`.
- **Přiřazení stanoviště:** splitmaker zapisuje jen na stanoviště, která mu admin přiřadí na
  `/admin/den-zavodu/zive` → „Splitmakeři a stanoviště“ (`mcvv_user.split_stations`, např. `1`
  nebo `13`; audit `user.split_stations_change`). `/mezicasy` mu ukáže jen přiřazená stanoviště;
  bez přiřazení vidí „Nemáš přiřazené stanoviště“ a nezapisuje nic. Server (`POST /api/live/splits`)
  zápis na nepřiřazené stanoviště odmítne po položkách (`rejected`, poznámka `station-not-assigned`,
  záznam v deníku), takže zápis klientovi nezůstane viset ve frontě. Admin a organizer smí dál na
  všechna stanoviště. Stanoviště, které zmizí z `live_stations`, přestane platit i v přiřazení.
- Mobil napřed: velké pole + číselník, „Zapsat“ uloží čas v okamžiku ťuknutí (korigovaný na hodiny
  serveru, vzorek s nejmenším RTT, každou minutu). „Razítko bez čísla“ = čas teď, číslo doplním.
- Fronta v IndexedDB (záložně localStorage), přežije reload, zavření prohlížeče i restart telefonu.
  Odesílání každou 1 s v dávkách ≤ 200, backoff 1 s → 30 s ±25 %, každý zápis má UUID → server
  deduplikuje. Ověřeno E2E: 5 min bez sítě, 20+ zápisů, oprava, razítko, reload stránky během výpadku
  → po obnovení vše odesláno, žádná ztráta ani duplicita.
- Opravy: neodeslaný zápis se přepíše na místě, odeslaný → operace `correct`/`delete` (server
  uvolní původní hodnotu jen pokud ji vlastní ten zápis). Dvojí zadání čísla na stanovišti → varování.
- Service worker `/mezicasy-sw.js` (scope `/{locale}/mezicasy`) cachuje stránku a statické soubory,
  API nikdy. Otevření stránky úplně bez signálu ověřit na STG (v `next dev` se offline nehydratuje).
- Konflikty z webu: první zápis vyhrává, další je `duplicate` (vidí ho admin v přehledu).

## Výpis a ruční editace mezičasů (Q31)

Na stejné stránce `/admin/den-zavodu/zive/casy`, jen admin, **vždy** (i v den závodu, Q32).

- Tabulka čísel ročníku (startovka + čísla, která mají čas, ale nejsou ve startovce): sloupce
  stanoviště a cíl, štítek „ručně“ (zapsal admin), `!` otevřený konflikt, `↕` časy nejdou po sobě.
  Hledání podle čísla nebo jména, volitelně i čísla bez časů.
- Editace čísla (`?edit={číslo}`): u každého splitu doplnit / přepsat / smazat. Čas od startu
  (`m:ss`, `h:mm:ss`, sekundy; 0–6 h) nebo denní čas průchodu `hh:mm[:ss]` (Europe/Prague, den nuly;
  přepočte se podle startu čísla). Číslo mimo startovku jen se zaškrtnutím „přesto uložit“.
- Ruční zápis je vědomé přebití pravidla „první vyhrává“: přepíše uloženou hodnotu, přepis a smazání
  vyžadují důvod. Formulář nese zobrazenou hodnotu – když se mezitím změnila, nic se neuloží.
- Deník: zápis `source: "admin"`, `entry_key` `adm:{uuid}`, `user_id`, důvod v `note`; původní
  vlastnící zápis → `replaced` / `deleted`, otevřené konflikty k buňce → `rejected`
  (`superseded-by-admin`). `mcvv_split.autor` = `admin`. Web dostane `duplicate`.
- Audit: `raceday.split_set` / `raceday.split_deleted` (z čeho na co, důvod),
  `raceday.split_conflict_resolved` / `raceday.split_conflict_dismissed`.
- „Přijmout“ konflikt projde jen, když v `mcvv_split` pořád je hodnota, proti které konflikt
  vznikl (`existing=` v poznámce); jinak hláška a nic se nemění.

## Vyčištění mezičasů ročníku (Q31, Q32)

`/admin/den-zavodu/zive/casy` (odkaz „Mezičasy ročníku“ na stránce Živě), jen admin.

- Filtr: splity (stanoviště + cíl 9) a zdroj: vše / web / OBD (historické zápisy) / ručně (admin).
  „Vše“ smaže všechny řádky `mcvv_split` vybraných splitů aktuálního ročníku (i legacy
  řádky bez deníku); se zdrojem jen řádky, které ten zdroj vlastní (zápis `applied` / `resolved`
  se stejným číslem a časem), a jeho záznamy v deníku.
- Náhled počtů → potvrzení opsáním ročníku → jedna transakce: smaže `mcvv_split`, záznamy deníku
  `mcvv_split_entry` včetně konfliktů (jinak by „Přijmout“ vrátil testovací čas). Volitelně smaže
  zkušební nulu.
- Audit `raceday.splits_cleared` (`target year:{rok}`): filtr, počty a snímek smazaných řádků
  `[číslo, split, čas, autor, created]` jako podklad pro případnou obnovu. Ukazuje se v historii
  na `/admin/den-zavodu`.
- Q32: hromadné vyčištění je zakázané od skutečné nuly ročníku (den závodu 10:15, zkušební nula se
  nebere v úvahu) dál; před ní povolené. Jednotlivé opravy jdou vždy (editace mezičasů).
- Starší ročníky (legacy archiv) se tudy smazat nedají – vždy jen aktuální ročník.
- Po vyčištění ať splitmakeři načtou `/mezicasy` znovu.

## Generálka

1. Admin: zkušební nula = teď (nebo „Testovací běh“ níže).
2. Admin přiřadí splitmakerům stanoviště (Živě → „Splitmakeři a stanoviště“). Operátoři se
   přihlásí a otevřou `/mezicasy` (vidí jen svá stanoviště).
3. Po generálce: `/admin/den-zavodu/zive/casy` → „Vyčistit mezičasy ročníku“ (vše, zaškrtnout
   smazání zkušební nuly).

## Testovací běh na produkci (#186)

Místo ruční generálky výše: `/admin/den-zavodu/zive` → „Testovací běh“ (jen admin).

- **Nula:** za 5 minut, dnes 10:15, dnes 20:15 nebo přesný čas. Uloží se jako zkušební nula
  (formulář nastavení ji během testu needituje); fiktivní start jede podle skutečné startovky.
  Splitmakeři, Start a ruční zápisy fungují jako v den závodu, na stránkách dne závodu
  a na `/mezicasy` svítí banner TEST.
- **Konec:** „Ukončit test“, nebo automaticky 3 h po nule (resp. po spuštění, je-li nula
  v minulosti), nejpozději v den závodu 00:00. Vypršení hlídá interní tick
  (`src/lib/live/scheduler.ts`, à 30 s) i každé načtení stránky dne závodu.
- **Úklid (automaticky, bez potvrzení):** mezičasy a deník mezičasů, evidence startu vzniklé od
  spuštění testu (nikdy po dni závodu 00:00), zkušební nula. Audit `raceday.test_started` / `raceday.test_ended`
  se snímkem smazaných řádků.
  Stav testu je v `Setting` `live_test_run` (bez migrace).
- **Den závodu:** od 00:00 test spustit nejde; když zůstala data z doby před dnem závodu,
  zkušební nula nebo neukončený test, stránky dne závodu ukážou červené varování.

Data testu se na veřejné stránky nedostanou: online výsledky okno testu skrývají (Q117)
a oficiální výsledky se zveřejňují až po kontrole hlavním rozhodčím.
