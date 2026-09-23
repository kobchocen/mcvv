# Plán — jeden login + role (23. 9. večer)

## Rozhodnuto z legacy

- E-mail žije na **přihlášce** (`mcvv_prihlaska.email`), ne na `cis_bezec`.
- Jedna přihláška = jeden přihlašovatel (jednotlivec nebo klub), víc běžců v řádcích.
- Editace / storno jen zadáním e-mailu je málo — to se nahradí.

## Model

Účet má **přihlašovatel**, ne každý běžec v řádku.

- `User` nová tabulka (ne legacy `users`)
- role: `registrar` (přihlašovatel) | `organizer` | `admin`
- `runner` jako samostatná role teď ne — běžec zůstává v `cis_bezec`
- `/admin` = organizer + admin
- Veřejný formulář i správa jen po loginu (povinný účet přihlašovatele).
- Magic link jen na ověření e-mailu / reset hesla, ne jako jediná správa.

Párování: User.email = `mcvv_prihlaska.email`. Řádky běžců se na User nenameují.

## Role

|                              | Přihlašovatel | Organizátor | Admin |
| ---------------------------- | ------------- | ----------- | ----- |
| Nová přihláška               | ano           | ano         | ano   |
| Edit / storno své přihlášky  | ano           | ano         | ano   |
| Cizí přihlášky, platby       | ne            | ano         | ano   |
| Partneři, ročníky, číselníky | ne            | ano         | ano   |
| Uživatelé / role             | ne            | ne          | ano   |
| Newsletter odeslat           | ne            | ne (zatím)  | ano   |

## Vlny

**A** — User + 3 role + login. Seed admin/organizer z env. `/admin` dashboard. Veřejný formulář ještě ne.

**B** — partneři, ročníky, číselníky (kategorie, kluby).

**C** — admin: přihlášky + platby. Pak veřejný formulář jen pro přihlášené.

**D** — newsletter z e-mailů přihlášek, až SMTP.

**E** — „můj profil běžce“ jen pokud bude chtít; není nutné k přihláškám.

## Newsletter

- Adresáti: distinct e-mail z `mcvv_prihlaska`, kde `promotion` není `N`.
- Odhlášení v patičce každého mailu → `promotion = N` u všech přihlášek s tím e-mailem.
- Nejdřív test na Pavla/Martina, pak ostrý send. SMTP až Azure.

## Zavřeno

- Účet povinný u přihlášky i správy.
- Newsletter na všechny e-maily kromě promotion=N.
