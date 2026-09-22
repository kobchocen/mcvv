# Brief 04b — Landing: pryč mylné defaulty + nav/hero

Pro vývojového agenta v `~/clients/kobchocen/mcvv/web`.  
**Push zakázán. Profil SVG a mapu (trasa SVG, šipka) nesahej** — jen texty a nav/hero/sekce 01.

## Owner 16. 9. 2026

- 2026 **není ZHL** (jako vloni)
- startovné a ceny **jako vloni** (100/200, 50/100)
- **žádný zvlášť start dětí** — jedna trať, interval od 10:15
- vyhlášení **12:20** platí
- místo jen **Velká Veranda, Choceň**

## Cíl

Projít homepage JSON + komponenty (`common.json` cs/en, `mcvv-homepage-content`, info/hero/overview/final CTA, navbar). Sjednotit s Rozpisem a sekcí 03.

Pryč / opravit:

| Bylo                                                   | Má být                                              |
| ------------------------------------------------------ | --------------------------------------------------- |
| Restaurace Velká Veranda, PSČ, sokolovna, Tyršovo nám. | Velká Veranda, Choceň                               |
| Start 11:00                                            | **10:15** interval 15 s                             |
| Start dětí 9:30 / 10:00                                | **žádný** — neslibovat druhý start                  |
| 200 m+                                                 | **200 m**                                           |
| ZHL / liga v copy 2026                                 | pryč                                                |
| Děti zdarma / 200–300 Kč z JSON                        | **100/200** dospělí, **50/100** žactvo (Edition 34) |
| CTA na `#register`                                     | odkaz **`/prihlasky`**                              |

Kontakt `info@velkaveranda.cz` a `+420 777 123 456` **nemen**.

`#info` karty: stejná fakta jako Rozpis. Neduplikuj právní text.

## Nav, hero, sekce 01

1. Hero: **Propozice → Rozpis**, `href` `/program`.
2. Navbar: zrušit dropdown **Závod**. **Závod** = jeden odkaz na sekci **01 O závodě** (kotva overview, ověř `id` v šabloně).
3. Sekce 01: **20+ → 30+** (cs i en).
4. Na konec sekce 01 tlačítka (wrap na mobilu):
   - Přihláška → `/prihlasky`
   - Rozpis → `/program`
   - Pokyny → `/pokyny` — když stránka není, placeholder ve stejném duchu jako přihlášky („Pokyny se připravují“), bez eseje
   - Startovka → `/startovka` — placeholder „Startovní listina ještě není zveřejněna“
   - Výsledky → `/results`

Navbar „Přihlásit se“ taky `/prihlasky`.

Pathnames doplň do `next-intl.config.ts` (`/prihlasky`, `/pokyny`, `/startovka`).

## Mimo scope

- Mapa, countdown logika, profil křivka, seed, přepis Rozpisu.
- Formulář přihlášky, skutečná startovka.
- Push.

## Akceptace

- [ ] Homepage bez sokolovny, 11:00, 9:30/10:00 dětí, 200 m+, ZHL, restaurace.
- [ ] 6. 12. 2026, Veranda, 10:15, 200 m, 4 300 m.
- [ ] Hero Rozpis → `/program`.
- [ ] Nav Závod bez dropdownu → sekce 01.
- [ ] 30+, ne 20+.
- [ ] Sekce 01: pět odkazů výše.
- [ ] CTA → `/prihlasky`.
- [ ] cs i en, lint + format:check.
- [ ] Žádný diff mapy/profilu kromě copy ve stejném souboru.

## Hotovo

Změněné klíče + screenshot hero a sekce 01. Nic nepushovat.
