# Brief 06d — Landing 04 výška + chrome výsledků

Pro vývojového agenta v `~/clients/kobchocen/mcvv/web`.  
**Push zakázán.** Statistickou logiku nesahej.

## Landing 04

- Spodek karty **2025** a spodní řady statistických karet **lícují** (stejná výška sloupce / stretch).
- Celá karta 2025 je klikací jako stat karty → `/results/2025` (nebo aktuální dokončený ročník). Uvnitř ať zbude i text „Kompletní výsledky“.

## `/results` a `/results/[year]`

Chybí **site header / navbar** (logo, O závodě … Partneři, Přihlásit se). Stejný chrome jako zbytek webu, včetně patičky pokud na landingu je.

Na `/results/[year]`:

- „Zpět na přehled ročníků“ → **Přehled ročníků** (odkaz `/results`). Žádné „zpět“ — vstup nemusí být z archivu.
- „Domů“ může zůstat (logo už taky vede na `/`).

## Mimo scope

- 02/03, SMTP, rebase/push, změna tabulek statistik.

## Akceptace

- [ ] 04: lícující karty, 2025 celá klikací.
- [ ] `/results` i `/results/2025` mají navbar.
- [ ] Label Přehled ročníků.
- [ ] lint + format:check.

## Hotovo

Screenshot 04 + `/results` + `/results/2025` s navbarem. Nic nepushovat.
