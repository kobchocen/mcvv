# Brief 09a — Admin přihlášení

Větev: `git switch -c feature/admin` z aktuálního **develop**.  
Push na `origin/feature/admin`. main / develop nesahej (jen push feature).

## Cíl

`/admin` jen pro přihlášené. Bez odkazu ve veřejném menu.

## Auth

- Session cookie (NextAuth nebo vlastní session). Ne HTTP Basic, heslo ne do gitu.
- Tabulka `users` má legacy plaintext 8 znaků — **nepoužívat k loginu**. Nový hash (bcrypt/argon).
- Dva účty ze env, např. `ADMIN_USERS` JSON `[{user,hash}]` nebo dva páry v `.env.example` (bez ostrých hesel).
- Login `/admin/login`, odhlášení, middleware na `/admin/*`.
- Neúspěšný login: obecná hláška, žádný enumerace uživatelů.

Owner na Mini doplní hesla do `.env` (necommit). Do briefu hesla nepište.

## UI

Jedna obrazovka po loginu: „Administrace“ + odhlásit + placeholder „Ročníky a kategorie v další vlně“.
Stejný navbar webu není nutný; ať je poznat, že jste v adminu.

## Mimo

Ročníky, kategorie, partneři, fotky, přihlášky, SMTP.

## Akceptace

- [ ] /admin bez session → login
- [ ] špatné heslo nepustí
- [ ] správné heslo → dashboard
- [ ] odhlášení
- [ ] lint, format:check, typecheck
