# Brief 04 — Rozpis (propozice)

Pro vývojového agenta v `~/clients/kobchocen/mcvv/web`.  
**Push zakázán. Profil tratě a sekci 03 (schedule/mapa) nesahej.**

## Kontext

Legacy `rozpis.php` = základní informace o ročníku. Data z `mcvv_info` (Prisma `Edition`) + číselník kategorií `cis_mcvv_kateg` (`Category`).  
V novém webu je to `/program`: statický JSON, mrtvé CTA, rozpory (sokolovna, 9:30, 11:00, 200 m+).

Owner: **název Rozpis**, ne Propozice. Letošek (2026) vychází z **poslední edice v DB**, kanonická fakta z briefu 03 přebíjí starý JSON.

Přihláškový formulář **nedělej**.

## Zdroj pravdy

| Položka                         | Odkud                                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------ |
| Datum ročníku 2026              | **neděle 6. 12. 2026** (ne `Edition.date`, dokud v DB není řádek 2026)                     |
| Místo                           | **Velká Veranda, Choceň** + GPS 49°59'45"N, 16°12'10"E. Žádná restaurace, žádná sokolovna. |
| Start                           | interval **15 s** od **10:15**                                                             |
| Harmonogram                     | přihlášky na místě do **9:45**, start od **10:15**, vyhlášení **12:20**                    |
| Trať                            | 4 300 m, lesní cesty a pěšiny, cca 400 m asfalt, převýšení **200 m**, značeno fáborky      |
| Pořadatel                       | K.O.B. Choceň                                                                              |
| Startovné, ceny                 | stejné jako vloni = sloupce poslední `Edition`                                             |
| ZHL 2026                        | **ne** (jako vloni) — v UI 2026 žádná věta o Zimní hradubické lize                         |
| Start dětí                      | **není** — jedna trať, intervalový start všichni od 10:15                                  |
| Kategorie + věkové hranice      | `Category` (`jmeno`, `age`); ročník narození = `2026 - age`                                |
| Právní texty (GDPR, upozornění) | copy v JSON (převzít smysl z legacy, cs i en)                                              |

Čtení DB: `@/lib/db/client`. Když `Edition` / kategorie chybí, stránka nespadne — fees/ceny jako „—“ a kategorie prázdná tabulka + věta, že se doplní.

## Cíl

1. Stránka se jmenuje **Rozpis** (nav, title, H1). URL může zůstat `/program` (pathnames už existuje). Nové `/rozpis` nedělej.
2. Obsah jako legacy bloky, ne osm vágních karet s falešným místem.
3. Čísla z poslední `Edition`. Datum/místo/čas **2026 z tabulky výše**, i když poslední edice je 2025.
4. CTA „Přihlásit se“ / odkaz na `#register` pryč. Místo toho jedna věta: přihlášky online později, na místě do 9:45.

## Bloky (pořadí)

1. Rozpis — `{n}. ročník …` kde `n` = id poslední edice + 1, pokud 2026 v DB ještě není; jinak `Edition.id` řádku 2026. **Bez ZHL.**
2. Datum — neděle 6. 12. 2026
3. Místo — Velká Veranda, Choceň, GPS
4. Pořadatel
5. Popis tratě
6. Přihlášky — bez živého formuláře; deadline online z `prihlDatum` poslední edice **nepoužívej jako 2026**, pokud je to loňské datum. Pro 2026 napiš: online termín bude doplněn; v den závodu do 9:45. Platnost online až po platbě — nech v copy.
7. Startovné — `startDospMail` / `startDetiMail` / `startDospMist` / `startDetiMist` z poslední edice + věta o vítězích a veteránech (odkazy na neexistující `/s_vitezove` nedělej — jen text).
8. Kategorie — tabulka z DB
9. Ceny — `finDosp1–5`, `finVet1–3`
10. Start — interval 15 s
11. Časový harmonogram
12. Ochrana údajů / foto
13. Upozornění (vlastní nebezpečí, děti pod 6, celá trať, prodej jen se souhlasem — „pořadatele“, ne legacy překlep pařadatele)
14. Informace — mcvv.org

Pole Prisma mapuj podle `schema.prisma` (`@@map` na sloupce `mcvv_info`). Názvy v kódu ber ze schématu, nehádaj camelCase.

## Soubory (očekávané)

- `src/app/[locale]/program/page.tsx` — může číst Prisma (`force-dynamic`)
- `src/components/templates/mcvv-program-*`
- `src/i18n/locales/cs/common.json` + `en/common.json`
- `next-intl.config.ts` — pathnames ať `/program` v nav zůstane, label **Rozpis**
- navbar dropdown „Závod“ — položka už může říkat Rozpis; sjednoť

JSON = labely a právní odstavce. Čísla startovného a cen **nehardcoduj**, pokud je Edition v DB.

## Mimo scope

- Online přihláška, platby, Prisma migrace, nový řádek 2026 v DB.
- Online přihláška, platby, admin CMS.
- Nová Prisma migrace schématu (tabulky už existují).
- Profil tratě, mapa/countdown sekce 03 (časy vlevo na homepage ale ano — viz brief 04b).
- Push.

Import ročníků a sjednocení landing copy jsou **brief 04a a 04b**, ne tento soubor.

## Akceptace

- [ ] Title/H1/nav: Rozpis. Žádná sokolovna, žádný start 11:00, žádné 200 m+, žádné 9:30 jako start dětí.
- [ ] 6. 12. 2026, Veranda, 10:15, 9:45, 12:20, 4 300 m / 200 m.
- [ ] Startovné a ceny z poslední `Edition` (nebo „—“ bez pádu).
- [ ] Kategorie z `Category`.
- [ ] Žádný falešný odkaz na formulář / `#register`.
- [ ] cs i en.
- [ ] Desktop + mobile.
- [ ] `pnpm lint && pnpm format:check`.
- [ ] Žádný diff v `mcvv-profile-section.tsx` ani schedule/mapě.

## Hotovo

Seznam souborů, odkud se četla Edition (rok posledního řádku), screenshot Rozpisu cs desktop. Nic nepushovat.
