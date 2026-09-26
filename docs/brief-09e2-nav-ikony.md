# Brief 09e2 — Zúžit účet v navu

Větev **feature/admin**. Push jen na ni.

Hlavička se session je přeplněná. Layout, login, dlaždice /admin a CRUD nesahej.

## Pravá strana navu

- Jazyk: jen **CZ** / **EN** (aktuální locale), bez slova navíc. Globe může zůstat jako malá ikona vedle zkratky, ne „CZ ▾“ jako velký ovladač. Mobil stejně.
- Theme toggle nechat.
- Jméno nechat (text).
- **Moje přihláška** → label **Přihláška** (stejný odkaz `/prihlasky`).
- **Administrace** (jen staff): text pryč, ikona ozubeného kola / sliders. `aria-label` + tooltip Administrace. Odkaz `/admin`.
- **Odhlásit se**: text pryč, ikona odchodu (dveře / log-out). `aria-label` + tooltip Odhlásit se. Pořád POST logout → `/`.

Bez session: **Přihlásit se** textem, jak teď.

Hero CTA nesahej.

## Akceptace

lint + format:check. Commit, push.
Screenshot landingu jako Pavel (ikony + Přihláška) a jako Franta (bez ozubeného kola).
