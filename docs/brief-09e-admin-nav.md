# Brief 09e — Admin pod hlavičkou webu

Větev **feature/admin**. Push jen na ni.

## Problém

`/admin` má vlastní hlavičku. Přehled pořád říká, že přihlášky a newsletter přijdou později. Staff po loginu skočí na `/admin`, i když je zároveň přihlašovatel.

## Login

Po úspěšném `/prihlaseni` vždy `/` ve stejném locale. Platí pro registrar, organizer i admin.
Výjimka: `?next=` když někdo otevřel chráněnou URL bez session (např. `/admin/prihlasky`) — po loginu zpět tam.

## Veřejný navbar (všechny stránky včetně /admin)

Bez session: Přihlásit se → `/prihlaseni`.

Se session:

- jméno
- **Moje přihláška** → `/prihlasky`
- **Administrace** → `/admin` — jen `organizer` a `admin`
- Odhlásit se → `/`

Na `/prihlasky` žádný druhý blok účtu.

## /admin

Zrušit `McvvAdminNav` a vlastní admin header.
Stejný veřejný navbar + patička jako zbytek webu.

Přehled `/admin` = nadpis Administrace + dlaždice (ne menu):

- Partneři → `/admin/partneri`
- Ročníky → `/admin/rocniky`
- Číselníky → `/admin/ciselniky`
- Přihlášky → `/admin/prihlasky`

Jedna věta pod nadpisem, ne placeholder o „další vlně“.

Vnitřní stránky (partneři, ročníky, …) nahoře jen odkaz **Administrace** zpět na `/admin`. Žádný druhý pruh odkazů.

Odhlásit se z adminu stejně jako z landingu → `/`.

## Mimo

Newsletter dlaždice ještě ne. Role, formulář přihlášky, platby, partneři CRUD nesahej.

## Akceptace

lint + format:check. Commit, push.
Screenshot: landing jako admin (v navu Administrace), `/admin` dlaždice pod webovou hlavičkou, landing jako Franta (bez Administrace).
