# Brief 09f3 — Párování běžce, klub z názvu, odhlášení, OAuth

Větev **feature/admin**. Push jen na ni.

## 1) Párování nového běžce

`resolveRunner` už bere `Příjmení Jméno` + prefix roku a pohlaví. Doplnit:

- porovnání jména **case-insensitive**, oříznuté mezery
- shoda = stejné jméno v `cis_bezec` a `id` začíná rokem narození
- jedno nalezené id → použít (i když se liší zadané pohlaví od 5. znaku — vzít existující)
- víc zásahů → ten, kde 5. znak sedí na zadané pohlaví; jinak chyba „upřesněte, existuje víc běžců“
- žádný → založit nové id jako teď

Duplicitu ve stejném roce dál odmítnout.

## 2) Klub = název přihlášky

Zpět. `club_name` u účtu nesahej (může zůstat v registraci, ale default klubu z něj **nebrat**).

Default klubu u nového i rychle přidaného běžce = `mcvv_prihlaska.nazev` (oříznuté).
Prázdný název → klub `000`.

U řádku jde klub změnit nebo vymazat (zůstává combobox na řádku).

**Rychlá nabídka:** pole Klub pryč. Skrytě posílat název přihlášky.

Nový běžec: input klubu předvyplněný názvem přihlášky, lze přepsat.

## 3) Seznam `/prihlaseni-zavodnici`

U každého jména:

- počet startů v `mcvv_time` (minulé ročníky, ne letošní přihláška)
- 0 → označení **nováček**

## 4) Odhlášení

Formulář v navu: po kliknutí disabled + spinner / text „Odhlašuji…“, dokud request neskončí. Stejně mobil.

## 5) Google / Apple

Stejná tabulka `mcvv_user` a stejná session cookie.

`/prihlaseni` a `/registrace`: tlačítka Přihlásit se přes Google / Apple pod formulářem.

OAuth vytvoří účet `registrar`, `emailVerified` hned, jméno z providera. E-mail už existuje → přihlásit ten účet (staff zůstane staff). Heslo u čistě OAuth účtu prázdné nelze — `passwordHash` náhodný, login heslem u něj ne.

Env do `.env.example` (prázdné):

- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_PRIVATE_KEY`
- `AUTH_ORIGIN` (lokálně `http://localhost:3000`)

Callback `/api/auth/callback/google` a `/api/auth/callback/apple`.
Chybí-li env, tlačítko daného providera nezobrazit.

Bez hesel a klíčů v gitu.

## Mimo

Startovní listina, newsletter, změna role.

## Akceptace

lint + format:check + typecheck. Commit, push.
Screenshot: přihláška bez klubu v rychlé nabídce, default klub = název, seznam s nováček/N startů, login s Google (pokud je env).
