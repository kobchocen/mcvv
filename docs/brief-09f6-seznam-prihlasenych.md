# Brief 09f6 — Veřejný seznam přihlášených

Větev **feature/admin**. Push jen na ni.

Stránka `/prihlaseni-zavodnici`. Logiku filtru neměnit: jen stav 5.

## Nahoře

- celkem přihlášených (součet řádků)
- věta: zobrazují se pouze přihlášky se zaplaceným startovným

## Kategorie

U nadpisu kategorie počet v závorce, např. `muži nad 50 let (2)`.

## Řádek = sloupce v jedné tabulce (ne flex wrap)

1. jméno
2. ročník
3. klub (prázdný = prázdná buňka)
4. starty / nováček
5. osobní rekord = nejlepší čas v `mcvv_time` (stejný formát jako výsledky). Nemá-li čas, prázdné.

Hlavička sloupce u rekordu. Řádky i skupiny kategorií ať sloupce lícují.

Startovka, párování, `/prihlasky` nesahej.

lint + format:check + typecheck. Commit, push.
Screenshot desktop.
