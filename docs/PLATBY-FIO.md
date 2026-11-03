# Párování plateb Fio

`POST /api/cron/payments` (Bearer `CRON_SECRET`) každých 15 min. Jeden dotaz na Fio za běh
(limit 1 / 30 s, hlídáno i v DB).

## Adaptivní interval a „Ověřit platbu“ (část 6)

- ACA Job může routy volat každou minutu (`chc-azure-terraform`, `cron_expression = "* * * * *"`).
  Routy samy rozhodnou (`src/lib/cron/cadence.ts`, stav `cron_slow_<routa>` v `mcvv_job_state`):
  - běžně pracují jen jednou za 15 min (rezerva 45 s na rozptyl startu) – dosavadní chování;
  - když existuje odeslaná nezaplacená pozdní přihláška s `platba_do` ≥ teď − 10 min,
    `/payments` stahuje z Fio každou minutu a `/reminders` každou minutu pustí jen pozdní
    přihlášky (`runLatePayment`) → zrušení po lhůtě do minuty. Celé upomínky dál po 15 min;
  - `/mail` zůstává na 15 min (transakční e-maily odcházejí hned přes `sendMail`).
- Pořadí nasazení: nejdřív aplikace (s ní se nic nemění ani při 15min cronu), potom terraform
  na 1 min. Opačně by se upomínky a fronta spouštěly každou minutu.
- Tlačítko „Zaplatil(a) jsem – ověřit platbu“ na platební obrazovce pozdní přihlášky spustí
  stejný job hned: max. 1× za 30 s na přihlášku (`verify_pay_<rok>_<id>`) a nikdy dřív než
  31 s od posledního dotazu na Fio (sdíleno s cronem). Mimo produkci (`PAYMENTS_DRY_RUN`)
  platby nespáruje.

- Režim dotazu: v produkci `/last/` (zarážka Fio). `/periods/` za posledních 7 dní se použije
  při prvním běhu dne a vždy po neúspěšném/přerušeném běhu (dohnání výpadku). Max. 89 dní zpět.
- Zpracují se jen příchozí platby s VS začínajícím aktuálním ročníkem (`currentRaceYear()`); ostatní
  provoz klubového účtu se neukládá.
- Spárováno (každá platba na existující přihlášku; platby se sčítají) → `mcvv_platba` (autor `fio`), přepočet stavu, auto-potvrzení
  (3/4 → 5 + potvrzovací e-mail), jakmile součet plateb pokryje startovné a platba je datována do 3. 12.
  ročníku. Pozdější platby jdou do denního souhrnu k ručnímu potvrzení. Přeplatek → příznak k vrácení.
- Nespárováno (neexistující/zrušená přihláška, chybný VS, jiná měna, haléře)
  → `/admin/platby` (Přiřadit / Vyřízeno), denní souhrn na `ALERT_TO` od 7:00, jen když je co hlásit.
- Chyby (token 401/403, chyba Fio, pád jobu) → alert na `ALERT_TO`, max. 1× denně pro druh chyby.
- `PAYMENTS_DRY_RUN` (výchozí mimo `APP_ENV=prod`): pohyby se jen zapíší se stavem `dry_run`.
- Idempotence: unikátní `fio_id`; pohyb zaseknutý ve stavu `processing` > 10 min → nespárovaný
  s důvodem „přerušené zpracování“ (ruční kontrola, nikdy dvojí platba).
- Token je v URL → URL se neloguje, chyby se redigují.
