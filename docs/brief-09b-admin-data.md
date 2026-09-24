# Brief 09b — Admin: partneři, ročníky, číselníky

Větev **feature/admin**. Push na ni. main/develop nesahej. Auth (A) nesahej.

Jen organizer + admin. Registrar → pryč z těchto cest.

## Menu v /admin

Odkazy: Přehled, Partneři, Ročníky, Číselníky. Odhlásit zůstane.

## Partneři (`sponsors`)

Seznam (category, poradi, active).
Edit: název, link, image (filename v `public/partners/`), category, poradi, active, description.
Nový partner. Soft: active=false stačí, mazání hard jen když není v UI potřeba.
Logo soubor: nahrát do `public/partners/` podle sloupce `image`, nebo zadat existující filename.

## Ročníky (`mcvv_info` / Edition)

Seznam od nejnovějšího.
Edit id 34 i starších: datum, prihl_datum, startovné 4 pole, interval, ceny 1–5 + vet 1–3, weather, temp.
Nový ročník: zkopírovat startovné a ceny z posledního, datum vyplní owner.
Neměnit id existujících řádků. Žádné mazání ročníku.

## Číselníky

**Kategorie** (`cis_mcvv_kateg`): název, věk, sort, sex, cislo_od/do, startovne, rekord.
**Kluby** (`cis_klub`): seznam za vybraný rok, přidat/upravit kód+jméno pro daný rok.
Běžce (`cis_bezec`) v této vlně ne.

## Mimo

Přihlášky, platby, newsletter, veřejný formulář, uživatelé.

## Akceptace

lint + format:check + typecheck. Commit, push.
Screenshot: menu, partneři, edit ročníku 34, kategorie.
