# E-mailová fronta

Všechny odchozí e-maily (ověření účtu, reset hesla, kontaktní formulář, potvrzení přihlášky,
alerty, později připomínky a souhrny plateb) jdou přes tabulku `mcvv_mail_queue`.
Newsletter má vlastní tabulku příjemců, ale počítá se do stejného denního rozpočtu.

## Pravidla

- Den = UTC (tak resetuje kvótu Resend). Strop `MAIL_DAILY_CAP` (90), rezerva `MAIL_PRIORITY_RESERVE` (15).
- Priorita 0 (`auth`, `confirmation`, `alert`) smí čerpat až do stropu; alerty až do 98.
- Priorita 1 (`contact`, `reminder`, `summary`, `other`) jen do `strop − rezerva`.
- Newsletter (nejnižší) dostane zbytek po čekajících e-mailech priority 1, max. 50 v dávce;
  po vyčerpání se kampaň automaticky dorozesílá z cronu další dny.
- Resend 429 s kvótou → e-maily zůstanou ve frontě s `not_before` = další UTC půlnoc a do konce dne se nic neposílá.
- Jiný 429 / 5xx / síť → opakování po 15 min, max. 5 pokusů; 4xx → `failed`.
- Při dosažení stropu / kvóty odejde 1× denně alert na `ALERT_TO` (mcvv@mcvv.org).
- Mimo produkci je výchozí `MAIL_DRY_RUN=true` (nic se neodesílá, záznam se označí jako odeslaný).

## Plánovaný běh

`POST /api/cron/mail` s hlavičkou `Authorization: Bearer $CRON_SECRET` každých 15 min.
Doporučení pro ACA: Scheduled Container Apps Job (`*/15 * * * *`, parallelism 1) s malým obrazem
(`curl`), který volá interní FQDN webu. Alternativa: GitHub Actions `schedule` (méně přesné, závisí na GitHubu).
