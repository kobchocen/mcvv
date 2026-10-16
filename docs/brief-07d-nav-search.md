# Brief 07d — Sticky nav, search v 04, pryč odkaz na profilu

Pro vývojového agenta v `~/clients/kobchocen/mcvv/web`.  
**Push zakázán.** Profilovou tabulku, medaile, fotky, API nesahej.

## Profil

Smazat odkaz **Archiv výsledků** na konci stránky. Logo / menu stačí.

## Navbar

Header webu (logo, O závodě … Partneři, Přihlásit se) **sticky** nahoře na **všech** stránkách. Při scrollu zůstane vidět, nepřekrývat obsah pod sebou (padding/spacer jako doteď + `sticky top-0 z-50`). Pozadí neprůhledné.

## Sekce 04 — hledání

Input **není** přes celou šířku.

Desktop: jeden řádek s nadpisem — vlevo „Generace běžců…“, vpravo **úzký** input (cca 16–20 rem) a vedle něj stávající tlačítko Archiv výsledků.  
Dropdown návrhů pod inputem, `z-index` nad kartami, ať nepřekrývá celý blok.

Mobil: input pod nadpisem na šířku sloupce.

Chování našeptávače (2 znaky, 8 návrhů) nesahej.

## Mimo scope

- Push.

## Akceptace

- [ ] Profil bez spodního odkazu.
- [ ] Sticky nav na `/`, `/bezec/…`, `/results/…`.
- [ ] 04: malý search vpravo u nadpisu.
- [ ] lint + format:check.

## Hotovo

Screenshot 04 (search vpravo) + scrollnutý profil se sticky nav. Nic nepushovat.
