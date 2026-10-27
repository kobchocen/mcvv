# E-mailová fronta

Všechny odchozí e-maily (ověření účtu, reset hesla, kontaktní formulář, potvrzení přihlášky,
alerty, později připomínky a souhrny plateb) jdou přes tabulku `mcvv_mail_queue`.
Newsletter má vlastní tabulku příjemců, ale počítá se do stejného denního rozpočtu.

## Pravidla

- Den = UTC (tak resetuje kvótu Resend). Strop `MAIL_DAILY_CAP` (90), rezerva `MAIL_PRIORITY_RESERVE` (15).
- Strop a rezervu lze nastavit v administraci (Nastavení → „E-maily – denní limit“, jen role admin;
  klíče `mail.daily_cap`, `mail.priority_reserve`, `mail.unlimited` v `mcvv_setting`). Prázdné pole
  = env, bez uloženého nastavení se nic nemění. Změnu zapisuje audit `settings.mail_limit`.
- Přepínač „Bez denního limitu“ (vyšší tarif Resend) vypne vlastní strop fronty i newsletteru;
  ochrana proti 429 kvóty (níže) platí dál. Newsletter i tak jde v dávkách max. 50.
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

Týž běh před odesláním fronty automaticky potvrdí přihlášky letošního ročníku se startovným
0 Kč (stav 3 → 5), které se aspoň 45 min nezměnily (`FREE_AUTO_CONFIRM_QUIET_MS`). Potvrzovací
e-mail s řádkem „Startovné neplatíte“ jde do fronty jako `confirmation` s klíčem podle přihlášky
a jejích běžců (stejná sestava = jeden e-mail). Mimo `APP_ENV=prod` jde na pořadatelský e-mail
s předmětem `[TEST – pro …]`. Každé potvrzení zapíše audit `entry.auto_confirmed_free`
(aktér `system`); podle něj administrace ukazuje odznak „Zdarma – potvrzeno automaticky“.

## Banner newsletteru

Kampaň může mít volitelný banner v hlavičce (editor kampaně, sekce „Banner v hlavičce“). Buď se
vybere připravený banner (statický soubor v `public/images/newsletter/`, seznam v
`NEWSLETTER_BANNER_PRESETS` v `src/lib/newsletter/banner.ts`), nebo se nahraje JPG/PNG/WebP do
1 MB. Server nahraný obrázek zmenší na šířku 1200 px (retina, v e-mailu se zobrazí v 600 px),
uloží ho jako PNG (s průhledností) nebo JPEG do tabulky `webimages` s typem `newsletter` a
zveřejní ho na `/api/newsletter-banner?id=…`. Route vydá jen obrázky typu `newsletter`.

V e-mailu je banner jen odkazem na absolutní URL podle `AUTH_ORIGIN` (žádná příloha ani base64).
Alt text je povinný a odkaz po kliknutí je výchozí `https://mcvv.org`. Na STG je web za
Basic auth, takže skutečné poštovní klienty banner z dev.mcvv.org nenačtou; náhled v adminu
používá relativní cestu a funguje. Zdroj výchozí grafiky 2026 je v
`scripts/newsletter-banner/banner-2026.html`.
