# Brief 09c — Admin: přihlášky a platby

Větev **feature/admin**. Push na ni. Auth, partneři, ročníky, číselníky nesahej.

Jen organizer + admin.

## Menu

Přidat **Přihlášky**. Přehled může dál říkat, že veřejný formulář a newsletter přijdou později.

## Seznam `/admin/prihlasky`

Přepínač roku. Výchozí = rok z nejnovějšího `mcvv_info.datum` (2026). Když je prázdný, ať jde přepnout na 2025.

Řádek = jedna hlavička `mcvv_prihlaska` (rok + id):

- id, název, e-mail, datum pořízení
- počet řádků (`mcvv_prihlaska_radek`)
- startovné = součet `startovne` na řádcích
- zaplaceno = součet `mcvv_platba.castka` pro stejný rok a id
- rozdíl

`mcvv_platba.prihlaska_id` je v legacy `char`, id přihlášky je číslo. Párovat číselně (ne jako řetězec s mezerami).

Barva řádku:

- zaplaceno < startovné → nedoplatek
- zaplaceno > startovné → přeplatek
- 0 běžců → prázdná

`stav` zobrazit jako číslo, **bez vlastního významu**. V legacy je to krok formuláře (2 = rozpracovaná), ne stav platby.

`promotion`: ukázat. `N` = nechce maily.

Bez mazání celé přihlášky. Bez mailů, startovky, tisku čísel, losu.

## Detail `/admin/prihlasky/[rok]/[id]`

Hlavička k úpravě: e-mail, název, poznámka, promotion. Uložit.

Běžci (read-only v této vlně): jméno, ročník z prvních 4 znaků `bezec_id`, klub, kategorie, startovné, startovní číslo pokud je.

Platby: seznam (datum, částka). Přidat, upravit, smazat jednu platbu. Po uložení se součet na seznamu přepočte.

## Mimo

Veřejný formulář, účet přihlašovatele, SMTP, newsletter, zakládání nových běžců, mazání řádků.

## Akceptace

lint + format:check + typecheck. Commit, push.
Screenshot: seznam 2025 (nebo 2026), detail s běžci a platbou, formulář nové platby.
