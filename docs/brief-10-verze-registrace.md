# Brief 10 — verze v adminu + registrace

Větev: od `origin/develop`. Commitovat a pushnout na aktuální pracovní větev (feature/admin pokud existuje, jinak `feature/verze-registrace`). `main` nesahej. Profil tratě, mapa, landing copy nesahej.

## 1) Verze webu v administraci

Už existuje `src/lib/build-info.json` (`version`, `buildNumber`, `revision`) a `GET /api/version`. Žádné druhé číslování, žádná tabulka v DB.

- V `package.json` i `build-info.json` nastav `version` na **`1.0.0`**. `revision` lokálně může zůstat `local`.
- Na dashboardu `/admin` pod úvodní odstavec vypiš jeden řádek (cs i en), viditelný organizer + admin:
  - `Verze 1.0.0 · build {buildNumber} · {revision}`
- Čti přímo `build-info.json` (stejný zdroj jako `/api/version`). Nic nehádaj z git příkazu za běhu v kontejneru.
- Veřejný web, patičku a `/api/version` nesahej, pokud už verzi ukazují — jen admin dashboard.

Až poběží release na Azure, `revision` bude SHA a na STG vs prod půjde poznat build. Číslo 1.0.0 je start; další čísla řeší semantic-release, nerob ruční 1.0.1.

## 2) Registrace — heslo dvakrát, „nové heslo“

Soubory: `mcvv-register-form.tsx`, `register-actions.ts`, `Auth.*` v cs/en `common.json`.

- Label hesla: česky **„Zadejte nové heslo“**, EN „Choose a new password“.
- Druhé pole: **„Zadejte nové heslo znovu“** / „Confirm new password“.
- `autoComplete="new-password"` na obou. `minLength={8}` obě.
- Server: když se neshodují, vrať nový `error: "mismatch"` a hlášku (cs: „Hesla se neshodují.“). Neukládej účet.
- Přihlášení (`/prihlaseni`) neměň — tam je stávající heslo, ne nové.

## 3) Název klubu nepovinný

V akci už `clubName` povinné není (`|| null`). Chybí to v popisku.

- Label: **„Název klubu (nepovinné)“** / „Club name (optional)“.
- Input dál bez `required`. Server beze změny logiky.

## Mimo brief

OAuth URI, Resend na Azure, newslettery, DNS, import dat, `main`.

`pnpm lint`, `format:check`, `typecheck`. Screenshot: `/cs/registrace` (dvě pole hesla + klub) a `/cs/admin` (řádek verze). Nic nepushuj na `main`.
