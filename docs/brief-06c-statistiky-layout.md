# Brief 06c — Statistiky: layout landingu + kluby + účast

Pro vývojového agenta v `~/clients/kobchocen/mcvv/web`.  
**Push zakázán.** Logiku rekordů / veteránů / TOP 20 / věku nesahej.

## Landing 04

Karta **2025** je moc velká a tlačí 6 stat karet pod sebe přes celou šířku.

Desktop: **vlevo úzká karta ročníku** (rok, 266, M/Ž, kompletní výsledky), **vpravo mřížka 6 karet** (3×2 nebo 2×3). Ať se ročník a statistiky vejdou vedle sebe. Mobil: ročník nahoře, karty pod sebou.

## Traťové rekordy

- Smazat větu „Řádek se vypíše jen když vítěz kategorie…“.
- Doplnit **klub**. Data jsou — na `/results/2025` kluby jdou (K.O.B. Choceň, OK Lokomotiva…). Statistiky joinem míjejí.  
  Použij **stejný resolver jako stránka výsledků ročníku** (`cis_klub` = `id` + `rok`). Stejně TOP 20 a další statistiky s „—“. Nevymýšlej názvy.

## Účast

Řadit roky **od nejnovějšího** (2025 … 1993). Graf ve stejném pořadí (vlevo starší, vpravo novější **nebo** oboje DESC — tabulka DESC, graf ať jde časem zleva doprava ASC, ať sloupce dávají smysl).  
Owner: tabulka od posledního ročníku. Graf nech chronologicky zleva 1993 → doprava teď.

## Mimo scope

- 02/03, SMTP, partneři, push.

## Akceptace

- [ ] Desktop: ročník vlevo, 6 karet vpravo.
- [ ] Rekordy bez meta věty; klub, pokud data jsou.
- [ ] Účast tabulka DESC.
- [ ] lint + format:check.

## Hotovo

Screenshot landingu 04 + hlavička rekordů + horní řádky účasti. Nic nepushovat.
