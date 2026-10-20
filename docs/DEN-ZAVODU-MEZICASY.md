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

- Přístup: role `splitmaker`, `organizer`, `admin` (`canUseSplitsClient`). Ostatní vidí „nemáte
  oprávnění“. Role `splitmaker` přichází z větve `feature/role-obd-export` (#112); do jejího merge
  ji session neumí načíst, takže zatím fungují organizer/admin.
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

{"client":"obd-klient/0.1.0","items":[{"bib":41,"split":"9","timeS":1686,"seenAt":"2026-…Z"}]}
```

Odpověď `200`: `{"ok":true,"results":[{"id":"dev4:9:41:1686","outcome":"applied","bib":41,"time":1686}],"summary":{"applied":1}}`.

- Idempotence: klíč `dev{tokenId}:{split}:{bib}:{timeS}`. Opakované odeslání vrátí původní výsledek.
- Jiný čas pro číslo, které už čas má → `conflict` (nic se nepřepíše, rozhodne admin
  „Přijmout/Zamítnout“). Stejný čas z jiného zdroje → `unchanged`.
- `rejected` s důvodem: `before-start`, `too-long` (> 6 h), `future`, `stale`; neznámé číslo se uloží
  s poznámkou `unknown-bib`.
- Chyby: `401` (neplatný / prošlý / zrušený token, `reason`), `403` (`year-mismatch`,
  `split-not-allowed`), `422` (validace, `issues`), `429` (limit 120 požadavků, 4/s na token).
- Token: `/admin/den-zavodu/zive` → „Klíče zařízení“, zobrazí se jen jednou, platnost max. 3 dny
  (výchozí den závodu 6:00–18:00), povolené úseky (výchozí `9`), autor do `mcvv_split.autor`
  (výchozí `LuM`). Zrušení okamžitě.

## OBD klient (Windows)

`tools/obd-klient` – Go, jeden `.exe` bez instalace (CI ho sestaví jako artefakt). Návod
v `tools/obd-klient/README.md`.

### Předpoklady o exportu OBD (potvrdit s LuM)

1. Soubor `tmp/splits.csv` jako v legacy: `cislo;time_s`, oddělovač `;`, bez hlavičky, jedna
   řádka na číslo. Klient snese i `,`/tab, BOM, CRLF, hlavičku a čas `m:ss` / `h:mm:ss`.
2. `time_s` = čistý čas od individuálního startu v sekundách (např. `1686` = 28:06), ne denní čas.
3. OBD soubor přepisuje celý (snapshot), ne jen připisuje. Klient posílá jen nové/změněné řádky,
   změněný čas přijde jako konflikt.
4. Smazání řádku v OBD se na web nepropaguje (smaže admin ručně).
5. Kódování nehraje roli (jen číslice).
6. Jeden zdroj cíle = jeden token. Mezičasy 1,3/2,7 km z OBD by šly přes stejný klient s
   `split` `1`/`3`, pokud je OBD exportuje zvlášť.

Otázky pro LuM: přesná cesta a název souboru, jak často ho OBD přepisuje, zda obsahuje i DNF/DISK
(dnes ne – status je v `kon_vysl.csv` po závodě), zda je na cílovém PC internet (jinak sdílení z mobilu).

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
2. Operátoři se přihlásí, otevřou `/mezicasy`, vyberou stanoviště.
3. Na cílovém PC `obd-klient.exe -check`, pak běh.
4. Po generálce smazat zkušební nulu, zrušit tokeny, smazat testovací záznamy.
