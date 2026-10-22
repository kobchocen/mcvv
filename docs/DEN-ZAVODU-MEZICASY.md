# Den závodu: mezičasy, cíl z OBD a online výsledky (OFeed)

Issues #120, #121, #122, #127. Nahrazuje MRB a FTP upload z legacy webu.

```text
operátor 1,3 / 2,7 km ─▶ /mezicasy (web, offline fronta) ─▶ POST /api/live/splits ─┐
OBD v cíli (LuM) ─▶ splits.csv ─▶ obd-klient.exe ─▶ POST /api/race/{rok}/splits ───┤
                                                                                    ▼
                                                             mcvv_split (+ deník mcvv_split_entry)
                                                                                    │ à 30 s, jediný zapisovatel
                                                                                    ▼
                                                   OFeed  POST /rest/v1/upload/iof (IOF XML 3.0 ResultList)
                                                                                    ▼
                                                         veřejné výsledky orienteerfeed.com/events/{id}
```

## Data

- `mcvv_split` zůstává 1:1 s legacy (`cislo, rok, split, time, created, autor`, PK `cislo+rok+split`).
  Úseky: `1` = 1,3 km, `3` = 2,7 km, `9` = cíl. `time` = sekundy od individuálního startu.
- Start: nula ročníku (`raceStartFor`, 10:15) nebo „zkušební nula“ z `/admin/den-zavodu/zive`
  (generálka), interval 15 s, čísla > 600 jsou druhá vlna (`n' = číslo − 600`). Lokální helper
  `src/lib/live/start-time.ts` se nahradí výpočtem z #114.
- `mcvv_split_entry` je deník všech zápisů (web i zařízení): unikátní `entry_key` = idempotence,
  `outcome` = `applied | duplicate | unchanged | conflict | resolved | rejected | replaced | deleted`.
- `mcvv_ingest_token` = klíče zařízení (jen SHA-256 hash, prefix pro identifikaci).
- Migrace `20261021040000_live_splits` jen přidává dvě tabulky.

## Web klient `/mezicasy` (#121)

- Přístup: role `splitmaker`, `organizer`, `admin` (`canAccessSplits` v `@/lib/auth/roles`, #112).
  Ostatní (včetně `timing`) vidí „nemáte oprávnění“. Nepřihlášený jde na přihlášení s
  `next=/mezicasy` a po přihlášení se vrátí sem. Správa (`/admin/den-zavodu/zive`, OFeed, klíče
  zařízení) jen admin (`canManageLiveResults`); odkaz na ni je v hubu `/admin/den-zavodu`.
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

## API pro zařízení (#120)

`GET /api/race/{rok}/splits` – ověření tokenu. `POST` – nahrání:

```http
POST /api/race/2026/splits
Authorization: Bearer mcvv_live_…
Content-Type: application/json

{"client":"obd-klient/0.2.0","items":[{"bib":41,"split":"9","timeS":1686,"seenAt":"2026-…Z"}]}
```

`action`: `set` (výchozí – číslo má v souboru OBD tento čas) nebo `delete` (řádek s tímto časem
ze souboru zmizel). `replace` (výchozí `false`): smí jiný čas přepsat hodnotu z OBD.

Odpověď `200`: `{"ok":true,"results":[{"id":"dev4:9:41:1686","outcome":"applied","bib":41,"time":1686}],"summary":{"applied":1}}`.

- Idempotence: klíč `dev{tokenId}:{split}:{bib}:{timeS}` (smazání `dev{tokenId}:del:…`). Opakované
  odeslání vrátí původní výsledek. Když se stejná hodnota vrátí po přepsání/smazání, dostane klíč
  pořadové číslo `#2`, `#3`…
- Výchozí chování je 1:1 s legacy (Pavel, Q22): **platí první zapsaný čas**.
  - nový čas → `applied`; stejný čas → `unchanged`;
  - jiný čas → `conflict` (nic se nepřepíše; admin může hodnotu „Přijmout/Zamítnout“);
  - s `replace: true` (přepínač klienta `applyCorrections`, výchozí vypnuto) jiný čas přepíše
    hodnotu, kterou zapsalo OBD (`applied`, původní zápis `replaced`); ruční zápis (web, admin)
    se nepřepíše nikdy;
  - `delete` (přepínač klienta `deleteMissing`, výchozí vypnuto) smaže řádek `mcvv_split` jen když
    ho drží OBD se stejným časem (`deleted`), jinak `unchanged` s poznámkou `missing` / `not-owned`.
- `rejected` s důvodem: `before-start`, `too-long` (> 6 h), `future`, `stale` (web); neznámé číslo
  se uloží s poznámkou `unknown-bib`.
- Chyby: `401` (neplatný / prošlý / zrušený token, `reason`), `403` (`year-mismatch`,
  `split-not-allowed`), `422` (validace, `issues`), `429` (limit 120 požadavků, 4/s na token).
- Token: `/admin/den-zavodu/zive` → „Klíče zařízení“, zobrazí se jen jednou, platnost max. 3 dny
  (výchozí den závodu 6:00–18:00), povolené úseky (výchozí `9`), autor do `mcvv_split.autor`
  (výchozí `LuM`). Zrušení okamžitě.

## OBD klient (Windows)

`tools/obd-klient` – Go, jeden `.exe` bez instalace pro Windows 11 x64 (CI ho sestaví jako artefakt
`obd-klient-windows-amd64`). Návod v `tools/obd-klient/README.md`.

### Legacy import (zdroj pravdy)

Legacy `online/index_cHc_0607.php` (stránka s `meta refresh 60 s`, otevřená v prohlížeči po celý
závod) četla `tmp/splits.csv` přes `fgetcsv($soubor, 30, ';')` a každý řádek vložila jako
`INSERT INTO mcvv_split VALUES ('$data[0]', '$ar', '9', '$data[1]', now(), 'LuM')`:
sloupec 0 = startovní číslo, sloupec 1 = čas v sekundách od individuálního startu (`smallint`,
např. `1686` = 28:06), split napevno `9`, autor `LuM`, rok = rok posledního `mcvv_info`.
Duplicity zastavil PK `(cislo, rok, split)`, takže platil první řádek a opravy se do webu nedostaly.
Kódování nehraje roli (jen číslice).

### Potvrzeno Pavlem 21. 10. 2026

Všechno 1:1 podle legacy, LuM ani OBD nic nemění.

1. Cesta a název souboru se nezjišťují od LuM: zadají se v nastavení klienta (`config.json` → `file`,
   parametr `-file`) nebo dotazem při prvním spuštění `obd-klient.exe` (znovu `-setup`).
   Formát souboru je shodný s tím, který importoval legacy web (viz výše).
2. OBD každých 60 s zapíše celý soubor znovu (kompletní přepis). **Opravy ani smazání časů z OBD
   se nepropisují – platí první zapsaný čas jako v legacy** (doplněk Q22). Změněný čas se na webu
   ukáže jako konflikt pro admina. Přepis a mazání jsou v klientovi za přepínači
   `applyCorrections` / `deleteMissing` (výchozí vypnuto; mazání až po 2 verzích souboru,
   prázdný nebo výrazně kratší soubor nic nemaže).
3. DNF a diskvalifikace v souboru s mezičasy nejsou (status přijde po závodě v `kon_vysl.csv`, #123).
4. Jiné mezičasy OBD neexportuje; cíl je split `9`. Mezičasy 1,3 a 2,7 km zadávají lidé přes web (#121).
5. Export do OBD (TXT nebo HTML, sekce v jednom souboru, klub `000`, kódování windows-1250,
   oddělovač a pořadí sloupců) je přesně podle legacy `data/prihl2obd.php` (#117, #140; ověřeno
   proti výstupu nezměněného legacy skriptu bajt po bajtu).
6. Cílový počítač: Windows 11, smí se na něj instalovat, je na něm internet.
7. Zkouška nanečisto proběhne, až bude `obd-klient` hotový (viz Generálka).

Klient navíc snese `,`/tab, BOM, CRLF, hlavičku a čas `m:ss` / `h:mm:ss` (legacy by je nepřijal,
OBD je nepíše). Když je číslo v souboru vícekrát, platí první řádek jako v legacy.

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
  (`superseded-by-admin`). `mcvv_split.autor` = `admin`. OBD ruční hodnotu nepřepíše ani
  s `applyCorrections` (vlastní ji admin, ne OBD), web dostane `duplicate`.
- Audit: `raceday.split_set` / `raceday.split_deleted` (z čeho na co, důvod),
  `raceday.split_conflict_resolved` / `raceday.split_conflict_dismissed`.
- „Přijmout“ konflikt projde jen, když v `mcvv_split` pořád je hodnota, proti které konflikt
  vznikl (`existing=` v poznámce); jinak hláška a nic se nemění.

## Vyčištění mezičasů ročníku (Q31, Q32)

`/admin/den-zavodu/zive/casy` (odkaz „Mezičasy ročníku“ na stránce Živě), jen admin.

- Filtr: splity (stanoviště + cíl 9) a zdroj: vše / web / OBD (všechny klíče) / ručně (admin) /
  konkrétní klíč zařízení. „Vše“ smaže všechny řádky `mcvv_split` vybraných splitů aktuálního ročníku (i legacy
  řádky bez deníku); se zdrojem jen řádky, které ten zdroj vlastní (zápis `applied` / `resolved`
  se stejným číslem a časem), a jeho záznamy v deníku.
- Náhled počtů → potvrzení opsáním ročníku → jedna transakce: smaže `mcvv_split`, záznamy deníku
  `mcvv_split_entry` včetně konfliktů (jinak by „Přijmout“ vrátil testovací čas a deduplikace by
  stejný čas ze stejného klíče znovu nezapsala), vynuluje `ofeed_last_hash` (příští upload do OFeed
  proběhne i beze změny). Volitelně zneplatní klíče zařízení ročníku a smaže zkušební nulu.
- Audit `raceday.splits_cleared` (`target year:{rok}`): filtr, počty a snímek smazaných řádků
  `[číslo, split, čas, autor, created]` jako podklad pro případnou obnovu. Ukazuje se v historii
  na `/admin/den-zavodu`.
- Q32: hromadné vyčištění je zakázané od skutečné nuly ročníku (den závodu 10:15, zkušební nula se
  nebere v úvahu) dál; před ní povolené. Jednotlivé opravy jdou vždy (editace mezičasů).
- Starší ročníky (legacy archiv) se tudy smazat nedají – vždy jen aktuální ročník.
- Po vyčištění smazat na cílovém PC `state.json` klienta OBD, jinak už potvrzené řádky znovu nepošle.

## OFeed (#122, #127)

- Událost na orienteerfeed.com zakládá Pavel nebo Martin (veřejná). V `/admin/den-zavodu/zive` se uloží
  `eventId`, heslo pro upload (platí 7 dní – admin ukazuje, kdy vyprší) a přepínač „zapnuto“.
- Heslo je v DB šifrované (AES-256-GCM, klíč odvozený z `SESSION_SECRET`; při rotaci zadat znovu),
  nikdy se nevrací do UI ani neloguje; chybové zprávy se redigují.
- Uploader běží v procesu serveru (`src/instrumentation.ts`) à 30 s, jen v okně závodu
  (nula −2 h až +5 h). Mezi replikami zajišťuje jediného zapisovatele lease v `mcvv_job_state`.
  Nahrává se jen při změně dat (hash bez `createTime`), jinak každých 10 min. ~2 req/min ≪ limit
  OFeed 200 / 15 min.
- XML: IOF 3.0 `ResultList` (`status="Snapshot"`) se všemi kategoriemi, `Person/Id type="MCVV"`
  = startovní číslo (OFeed páruje závodníky podle Id), `SplitTime` 1,3/2,7 km, cíl jako
  `FinishTime`/`Time`, bez cíle `Active`, nezávodící `Inactive`. Validuje se proti oficiálnímu
  `IOF.xsd` v testech.
- „Nahrát teď“ a stažení XML v adminu, stav posledních 10 běhů a poslední chyba.
- Veřejný odkaz: když je OFeed nastavený a `online_results_url` prázdné, hero webu odkazuje na
  `https://orienteerfeed.com/events/{eventId}?tab=results`.
- Env: `OFEED_DRY_RUN` (výchozí `true` mimo `APP_ENV=prod` – XML se jen vygeneruje),
  `OFEED_API_URL` (výchozí `https://api.orienteerfeed.com`, pro test mock), `OFEED_SCHEDULER=false`
  vypne automatické nahrávání (zůstane ruční a `POST /api/cron/ofeed` s `CRON_SECRET`).

## Generálka

1. Admin: zkušební nula = teď, OFeed na testovací událost, token pro cílové PC.
2. Admin přiřadí splitmakerům stanoviště (Živě → „Splitmakeři a stanoviště“). Operátoři se
   přihlásí a otevřou `/mezicasy` (vidí jen svá stanoviště).
3. Na cílovém PC (Windows 11) spustit `obd-klient.exe` – při prvním spuštění se zeptá na adresu,
   klíč, ročník a cestu k souboru s mezičasy –, `obd-klient.exe -check`, pak běh. Vyzkoušet i opravu
   času v OBD (na webu zůstane první čas, admin uvidí konflikt).
4. Po generálce: `/admin/den-zavodu/zive/casy` → „Vyčistit mezičasy ročníku“ (vše, zaškrtnout
   zneplatnění klíčů a smazání zkušební nuly), na cílovém PC smazat `state.json` klienta.
