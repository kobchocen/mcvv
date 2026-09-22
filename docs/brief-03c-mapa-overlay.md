# Brief 03c — Overlay mapy: titulek a špendlík

Pro vývojového agenta v `~/clients/kobchocen/mcvv/web`.  
**Push zakázán. Profil tratě nesahej.** SVG vrstvy, countdown, CTA a copy vlevo nesahej.

## Kontext

Sekce 03 po briefu 03b vypadá dobře (tmavý podklad, oranžová trať, místopis, 10:15). Owner chce dva UI detaily na kartě mapy.

## Cíl

1. Horní nápis na mapě: místo **„CHOCEŇ — VELKÁ VERANDA“** text **„TRASA ZÁVODU“** (en: **„COURSE MAP“**).  
   Umístění: **pravý horní roh** karty, ať nepřekrývá smyčku u Písáčku / kopce 3.  
   Styl jako doteď (malé kapitálky, `race-accent` / stávající overlay), ne velký banner.

2. Špendlík u startu/cíle: **jen ikona pinu**, bez oranžového čtverce pod ním.  
   Velikost přiměřená tečce S/C — nesmí zakrýt VERANDA ani poslední oblouk tratě.  
   Barva `race-accent`, případně jemný stín kvůli čitelnosti na tmavé mapě.  
   Klikání není potřeba.

Box START · CÍL + „Velká Veranda, Choceň“ nech.

## Mimo scope

- Přebarvení vrstev SVG, místopis, počítadlo, `/program`, push.

## Akceptace

- [ ] Nápis „TRASA ZÁVODU“ / „COURSE MAP“ vpravo nahoře, nepřekrývá trať.
- [ ] Žádný „CHOCEŇ — VELKÁ VERANDA“ jako overlay na mapě.
- [ ] Pin bez čtvercového button pozadí.
- [ ] cs i en.
- [ ] Desktop + úzký viewport (nápis nesmí vylezt z karty).
- [ ] `pnpm lint && pnpm format:check`.

## Hotovo

Screenshot sekce 03 cs desktop. Nic nepushovat.
