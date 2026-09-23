# Brief 03 — Termín a místo (homepage `#date`)

Pro vývojového agenta v `~/clients/kobchocen/mcvv/web`.\
Jeden malý úkol. **Push zakázán. Profil tratě (**`mcvv-profile-section`**) nesahej.**

## Kontext

Owner (Pavel) doladí landing podle legacy webu (`mcvv.org`). Přihlášky až později.\
Tento brief = jen sekce **03 Termín a místo** na homepage.

Kanónická fakta pro tento ročník:

- Datum: **neděle 6. 12. 2026**
- Start hlavního závodu: **10:15** (intervalový, legacy i Orlický deník)
- Místo: **Velká Veranda, Choceň** (ne sokolovna, **žádná restaurace**)
- Co to je: světlina / křižovatka v lese s dřevěným přístřeškem Veranda; historické místo, podle kterého se závod jmenuje
- Text v UI: **„Velká Veranda, Choceň“** — bez PSČ, bez „Restaurace“
- GPS (zatím nemusíš dávat do UI): 49°59'45"N, 16°12'10"E

## Cíl

1. Živé počítadlo do startu 6. 12. 2026 10:15 `Europe/Prague`.
2. Copy startu **11:00 → 10:15** (cs i en) v této sekci.
3. Tlačítko **Rezervovat startovné** zůstane vizuálně, ale je **placeholder** (žádný formulář, žádný falešný `#register` jako dokončená akce).
4. Placeholder mapa („Dark Woods Wilderness“) pryč. Místo ní reálná mapa tratě z legacy `images/trasa.jpg`, vizuálně sladěná s dark green / orange paletou webu.

## Soubory (očekávané)

- `src/components/organisms/` — schedule / date sekce homepage
- `src/i18n/locales/cs/common.json`
- `src/i18n/locales/en/common.json`
- případně nový client komponent pro countdown (`src/components/atoms` nebo `molecules`)
- `public/images/course-map.jpg` — viz blok „Jak vzít mapu“ níže
- typy v `src/components/templates/` pokud se mění tvar obsahu

JSON = copy. Datum/čas startu pro countdown drž **na jednom místě** (ISO v kódu nebo jeden klíč v JSON), ať se 11:00 nevrátí v jiné větě.

## Počítadlo

Tři stavy podle času `Europe/Prague` v den závodu (a mimo něj). Celou sekci neschovávej.

| Období                           | UI                                                                                                                                                                                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Před **10:15** dne závodu        | Tiká k startu aktuálního ročníku (2026: `2026-12-06T10:15:00`, timezone `Europe/Prague`). Label: cs „Do startu dalšího ročníku zbývá“, en podle stávajícího klíče.                                                                          |
| **10:15 až 12:59:59** dne závodu | Počítadlo schovat nebo zmrazit. Místo cifer nápis **cs: „Závod probíhá“** / **en: „Race in progress“**. Datum a místo vlevo zůstanou.                                                                                                       |
| Od **13:00** dne závodu          | Znovu živé počítadlo, tentokrát k **dalšímu ročníku**: první prosincová neděle následujícího roku, start znovu **10:15** Prague. Pro 2026 → cíl `2027-12-05T10:15:00` `Europe/Prague`. Label může zůstat „Do startu dalšího ročníku zbývá“. |

Pravidlo dalšího ročníku v kódu, ne natvrdo jen 2027: `first Sunday of December` + 1 rok, čas 10:15. Dokud je `now < raceStart` aktuálního roku, cíl je ten rok; od 13:00 závodního dne cíl = příští první prosincová neděle.

- Tiká v prohlížeči (dny / hodiny / minuty / sekundy).
- Nesmí zůstat hardcoded `187 / 14 / 32 / 08` z JSON.
- Hydratace: žádný mismatch server/client (počáteční render klidně `—` / nuly, stav doplnit po mountu).
- `Edition.date` z DB v tomto briefu **nevyžaduj**.
- Stav „Závod probíhá“ otestuj dočasným posunem cíle v dev (komentář / query `?debugClock=` není nutný; stačí dočasně podstrčit target a před odevzdáním vrátit ostré datum).

## CTA placeholder

- Label beze změny: „Rezervovat startovné“ / EN ekvivalent.
- `type="button"` nebo `aria-disabled`, `pointer-events-none` / vizuálně muted-orange pokud to design unese.
- `title` / malý hint: cs „Přihlášky se otevřou později“, en „Registration opens later“.
- **Nesmí** scrollovat na prázdný `#register` jako by šlo o hotovou akci.
- Žádný formulář, Prisma `Registration`, platby.

## Jak vzít mapu

Mapa je public/images/trasa.jpg.

## Mapa

Zdroj: legacy `trasa.jpg` (vrstevnice, růžová/oranžová trať, kopce 1–4, M1/M2, start/cíl u Verandy, inset profil).

Chování:

- Stejný layout karty jako teď (obrázek vpravo, overlay box START · CÍL dole).
- Horní nápis místo „DARK WOODS WILDERNESS – TRAIL MAP“: **„CHOCEŇ — VELKÁ VERANDA“** (cs i en stejný toponym).
- Spodní fiktivní „THE FOREST LOOP“ pryč, nebo nahradit ničím — místo zůstává v boxu START · CÍL.
- Styl: tmavý les + `race-accent` oranžová. Světlý papír mapy ztmavit (overlay / `mix-blend` / CSS filter). Magentu trati posunout k oranžové webu, **čitelnost vrstevnic a čísel kopců zachovat**.
- Oranžový pin dát k **startu/cíli** (pravý dolní bod mapy), ne doprostřed smyčky.
- Inset „Profil tratě“ na mapě může zůstat — nesmí vizuálně konkurovat sekci 02 (ta je zdroj pravdy o profilu).
- Next `<Image>`: `alt` česky/anglicky „Mapa tratě Malé ceny Velké Verandy“, rozumné `sizes`.
- Žádný Google iframe v tomto briefu.

## Mimo scope

- Profil tratě, hero, galerie, výsledky.
- Stránka `/program` (tam pořád můžou být sokolovna / 9:30 / 200 m+ / 11:00) — další brief.
- Online přihláška.
- Push na origin.
- Commit jen pokud owner řekne; preferuj `fix:` / `feat:` focused.

## Akceptace

- \[ \] web03: start „v 10:15“, ne 11:00 (cs i en).
- \[ \] Countdown se mění každou sekundu, cíl před startem 6. 12. 2026 10:15 Prague.
- \[ \] 10:15–12:59: nápis „Závod probíhá“ / „Race in progress“, ne nuly.
- \[ \] Od 13:00: countdown na první prosincovou neděli příštího roku 10:15 (po 2026 = 5. 12. 2027).
- \[ \] Po cílovém čase nespadne UI.
- \[ \] Tlačítko nevypadá jako funkční registrace.
- \[ \] Mapa je `trasa.jpg` / `course-map.jpg`, ne stock wilderness.
- \[ \] Žádná „Restaurace“ v adrese — jen Velká Veranda, Choceň.
- \[ \] Overlay nápis „CHOCEŇ — VELKÁ VERANDA“, ne Dark Woods.
- \[ \] Dark theme drží; light theme taky použitelný.
- \[ \] Desktop + mobile (mapa nesmí rozbít sloupec).
- \[ \] `pnpm lint && pnpm format:check` (build když stihneš).
- \[ \] Žádný diff v `mcvv-profile-section.tsx`.

## Hotovo nahlásit

Krátce: změněné soubory, screenshot cs desktop sekce 03, poznámka k filtru mapy (jak jsi sladil barvy).
