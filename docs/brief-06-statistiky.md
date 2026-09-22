# Brief 06 — Statistiky podle legacy

Pro vývojového agenta v `~/clients/kobchocen/mcvv/web`.  
**Push zakázán.** Trať 02/03, countdown, Rozpis nesahej. Kontakt/SMTP nesahej.

Pohlaví v datech: 5. znak `bezec_id` **&lt; 5 = muž**, **&gt; 4 = žena**. Rok narození = první 4 znaky id.

Jména vždy odkaz `/bezec/[id]`.

## Landing 04 — labely karet

Každá karta má **vlastní** text odkazu a URL, ne „Kompletní výsledky“ pětkrát.

| Karta            | Odkaz              | Cíl                    |
| ---------------- | ------------------ | ---------------------- |
| Traťové rekordy  | Vývoj rekordů      | `/statistiky/rekordy`  |
| Vítězové         | Absolutní vítězové | `/statistiky/vitezove` |
| Nejlepší časy    | TOP 20             | `/statistiky/casy`     |
| Rekordy dle věku | Podle věku         | `/statistiky/vek`      |
| Veteráni MCVV    | Klub veteránů      | `/statistiky/veterani` |
| **nová** Účast   | Celková účast      | `/statistiky/ucast`    |

Přidat šestou kartu Účast. Copy „Rekordy kategorií od 40 let“ pryč.

## `/statistiky/rekordy` — vývoj

Ne jeden aktuální čas na kategorii. Pro každou kategorii z `cis_mcvv_kateg` (řazení `sort`):

- projít roky vzestupně
- vítěz dané kategorie v roce (věk jako na Rozpisu: age 0 všichni daného pohlaví; &lt;20 ročník ≥ rok−age; &gt;20 ročník ≤ rok−age)
- **vypsat řádek jen když čas zlepší dosavadní rekord** kategorie

Sloupce: rok, běžec, rok nar., klub, čas.  
Sloupec „oficiální rekord“ z `cis_mcvv_kateg.rekord` sem nedávej (nebo jen poznámka pod tabulkou). Nadpis: Traťové rekordy a jejich vývoj.

## `/statistiky/vitezove`

Jeden řádek = jeden rok.

Sloupce: rok | muž | čas M | žena | čas Ž  
(volitelně klub). Řazení rok DESC nebo ASC — konzistentně, owner preferuje přehled po letech vedle sebe, ne dva bloky pod sebou.

Absolutní vítěz = nejlepší čas mužů / žen v roce (ne vítěz kategorie „muži“, pokud by to bylo totéž — u MCVV ano).

## `/statistiky/casy`

Dvě tabulky: **TOP 20 muži**, **TOP 20 ženy**.  
Sloupce: pořadí, rok, běžec, rok nar., klub, čas.  
Ne jeden žebříček smíchaný.

## `/statistiky/vek`

Řádek = **věk v letech** (rok závodu − rok narození), ne rok narození.

Sloupce: věk | rok M | muž | čas M | rok Ž | žena | čas Ž

Nejlepší čas daného věku a pohlaví (první po `ORDER BY age, sex, time` jako legacy). Věk bez protějšku: prázdné buňky.

## `/statistiky/veterani` — klub, ne 40+

Název **Veteráni MCVV**.

Člen = počet startů (`mcvv_time`) **&gt; polovina počtu ročníků s výsledky**  
(`round(count(distinct rok)/2 + 0.5) - 1` jako legacy `$pocr`, pak `pocet <= $pocr` break).

Dvě tabulky muži / ženy. Řazení: počet startů DESC, průměrný čas, osobní rekord.

Sloupce: pořadí, jméno, rok narození, počet účastí, osobní rekord, průměrný čas.

Žádné „rekordy 40+“.

## `/statistiky/ucast` — nová stránka

Z legacy `s_ucast.php`: po letech  
rok, počet účastníků, nováčků (první rok běžce), počet osobních rekordů, nejlepší čas, průměrný čas.

Graf účasti muži/ženy: jednoduchý CSS bar (ne GD jpeg). Tooltip počty M/Ž stačí.

## Mimo scope

- SMTP, loga partnerů (viz brief 06b), light theme hero, šipka mapy.
- Push.

## Akceptace

- [ ] Šest karet na landingu, správné labely.
- [ ] Rekordy = vývoj, vítězové = 1 řádek/rok, časy = 2× TOP 20, věk = věk ne ročník, veteráni = klub, účast existuje.
- [ ] lint + format:check.

## Hotovo

Screenshot každé z 6 stránek (horní část). Nic nepushovat.
