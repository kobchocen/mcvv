# Brief 09d3 — Stav účtu v hlavní navigaci

Větev **feature/admin**. Push jen na ni.

Session je vidět jen na `/prihlasky`. Na `/` a ostatních veřejných stránkách vypadá menu jako odhlášené; „Přihlásit se“ s platnou session jde rovnou do přihlášky.

## Navigace (všechny veřejné stránky + /prihlasky)

Bez session, vpravo:

- **Přihlásit se** → `/prihlaseni`
- žádné jméno

Se session, vpravo:

- jméno účtu (e-mail až v `title` / tooltip)
- **Moje přihláška** → `/prihlasky` (místo „Přihlásit se“)
- **Odhlásit se**

Na `/prihlasky` duplicitní blok jméno+odhlásit pod nadpisem zrušit, stačí nav.

Admin (`/admin`) nechat jak je.

Hero CTA „Přihlásit se“ se session taky na `/prihlasky`.

## Mimo

Klub, kategorie, token, platba.

## Akceptace

lint + format:check. Commit, push.
Screenshot landingu přihlášený (vpravo jméno + Moje přihláška + Odhlásit se) a odhlášený (Přihlásit se).
