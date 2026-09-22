# Brief 08 — Landing drobnosti + galerie

Pro vývojového agenta v `~/clients/kobchocen/mcvv/web`.  
Větev: **feature/web-obsah**. Push na tuto větev **ano** (PR #23). main / develop nesahej.

## 1) Střídání podkladu

Sekce landingu střídají `bg-race-deep` / `bg-race-forest` (nebo ekvivalent, ať sousedé nejsou stejní).  
Teď 03 a 04 splývají. Po úpravě: 02 ≠ 03 ≠ 04 ≠ 05.

## 2) Fotogalerie `/fotogalerie`

- Prvních **20**, tlačítko **Načíst další** po 20.
- Tooltip: **rok — popis — místo** (`popis` + `cis_fotka_kde`, kdo je na fotce když je vazba na běžce).
- Klik → modal plné velikosti (`/api/fotka?id=`), caption stejný text. Escape / křížek / klik mimo. Žádný BLOB v RSC.

## 3) Partneři

Loga z DB: aktivní. Řazení **nejdřív category, uvnitř poradi**. Soubor `public/partners/{image}`. Chybí-li soubor, název.

## 4) Copy

- Pořadatel: jen **„Pořádá K.O.B. Choceň, z.s.“** (bez města Choceň).
- Patička — pryč odkazy: Trať a profil, Termín a místo, Vítězové, Fotogalerie, Choceň.
- CTA sekce: pryč slovo **MCVV** z nadpisu („Připraven na čtyři kopce?“).

## 5) Mimo scope

- Hero fotka (řeší owner zvlášť).
- Admin, přihlášky.
- Profil tratě.

## Akceptace

- [ ] 03/04 mají jiný podklad.
- [ ] Galerie 20 + další + modal s popiskem.
- [ ] Partneři: category, pak poradi.
- [ ] Copy patičky a CTA.
- [ ] pnpm lint && pnpm format:check && pnpm typecheck.

## Hotovo

Commit na feature/web-obsah, push (PR #23).  
Screenshoty: 03+04, galerie+modal, patička, partneři.
