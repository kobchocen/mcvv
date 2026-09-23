# Brief 03d — Start/cíl: pryč pin, šipka z boxu na Verandu

Pro vývojového agenta v `~/clients/kobchocen/mcvv/web`.  
**Push zakázán. Profil tratě nesahej.** Countdown, CTA, SVG vrstvy a titulek „TRASA ZÁVODU“ nesahej.

## Kontext

Pin u S/C je malý, čtverec jsme už zrušili, ale start pořád není na první pohled. Owner: pin pryč, místo něj šipka z boxu START · CÍL k popisku VERANDA.

## Cíl

1. Odstranit špendlík (komponentu pin / Marker / overlay u S/C) úplně.
2. Doplnit **výraznou oranžovou šipku** (`race-accent`) **z boxu START · CÍL směrem doprava k Verandě** (start/cíl vpravo dole na mapě).
   - Vychází z pravého okraje boxu, končí u tečky S/C / nápisu VERANDA — ne přes půlku mapy.
   - Čitelná na tmavé mapě (stroke + případně krátká hlavice). Ne tlustý banner.
   - Nesmí zakrýt **4. KM**, kopec **1**, nápis VERANDA ani poslední oblouk tratě. Když se trefí do čáry, šipku posuň mírně pod trať nebo zkrátit.
3. Box START · CÍL + „Velká Veranda, Choceň“ zůstává.

Preferuj čisté SVG/HTML v overlay karty (čára + polygon hlavice), ne bitmapu. Light theme taky čitelný.

## Mimo scope

- Přebarvení mapy, místopis v SVG, `/program`, push.

## Akceptace

- [ ] Žádný pin.
- [ ] Šipka vede z boxu k Verandě, barva accent.
- [ ] Start/cíl je zřejmý bez hledání tečky S/C.
- [ ] 4. KM a VERANDA čitelné.
- [ ] Desktop + užší karta (šipka se zkrátí / nepřeleze box).
- [ ] `pnpm lint && pnpm format:check`.

## Hotovo

Screenshot cs desktop sekce 03. Nic nepushovat.
