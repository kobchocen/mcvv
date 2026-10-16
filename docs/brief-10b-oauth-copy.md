# Brief 10b — OAuth copy „Pokračovat přes …“

Větev: `feature/verze-registrace` (navázat na cab753e). main nesahej.

Komponenta `mcvv-oauth-buttons.tsx` je společná pro `/registrace` i `/prihlaseni`. Měň jen i18n, ne logiku.

`Auth.google` / `Auth.apple` v `src/i18n/locales/cs/common.json` a `en/common.json`:

- cs: „Pokračovat přes Google“ / „Pokračovat přes Apple“
- en: „Continue with Google“ / „Continue with Apple“

Žádný jiný text na těch tlačítkách. `pnpm lint` + `format:check`. Screenshot `/cs/registrace` stačí.
