# Brief 09d2 — Přihláška: odhlášení, klub, default kategorie

Větev **feature/admin**. Push jen na ni. Auth A–C a platbu/QR nesahej.

## Odhlášení a kdo je přihlášený

Na `/prihlasky` (a všude, kde je registrar přihlášený) musí být vidět:

- jméno a e-mail přihlášeného účtu
- tlačítko **Odhlásit se** (stejná akce jako v `/admin`)

Bez toho se z účtu nedá vyjít.

## Seznam běžců

Nadpis **Přihlášení běžci** (ne „Běžci“).

Ve sloupci u každého: jméno, **ročník narození** (první 4 znaky `bezec_id`), kategorie, startovné.

U každého řádku **klub** jako výběr (ne jen text z hlavičky). Změna klubu uloží `klub_id` na tom řádku. Nabídka: kluby aktuálního roku + stávající klub řádku, i kdyby letos chyběl.

Nový běžec i rychlá nabídka: klub default = název přihlášky, pokud k němu existuje klub; jinak první z nabídky. Po uložení jde klub u řádku změnit.

## Default kategorie podle věku

Při vyplnění ročníku narození (a pohlaví) předvybrat kategorii, která věku odpovídá — ne první v seznamu.

Pravidlo: věk = rok závodu − ročník narození. Z kategorií stejného pohlaví vybrat tu s nejvyšším `age`, kde `age = 0` nebo `věk ≥ age`. Příklad: 2010 v roce 2026 → 16 let → **dorostenci**, ne muži.

Seznam nabídek nechat (muži i dorostenci), jen default jiný.

## Mimo

Token ověření (09d-fix) řešte jen pokud ještě není. Nové maily, startovka, tisk ne.

## Akceptace

lint + format:check. Commit, push.
Screenshot: hlavička s uživatelem a Odhlásit se; seznam se sloupci ročník + klub; nový běžec 2010 s defaultem dorostenci.
