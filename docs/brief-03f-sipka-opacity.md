# Brief 03f — Šipka: míření a oddělení od tratě

Pro vývojového agenta v `~/clients/kobchocen/mcvv/web`.  
**Push zakázán. Profil nesahej.** Box START · CÍL (oranžový rámeček), mapa, countdown, CTA, titulek nesahej.

## Kontext

03e: rámeček boxu OK, šipka u S/C. Problém: stejná orange jako trať → vypadá jako pokračování okruhu do boxu. Míření ještě není čisté.

## Cíl

1. **Oddělit šipku od tratě**
   - `opacity` **80 %** (`race-accent` / `text-race-accent/80`).
   - Stroke **tenčí než trať** (anotace, ne druhá větev).
   - Hlavice menší, ať nesedí na čáře okruhu jako „konec etapu“.

2. **Nasměrování**
   - Linie vychází z **středu pravého okraje** rámečku boxu (kolmo na hranu, bez mezery).
   - Končí **těsně před tečkou S/C**, ne přes ni a ne na nápis VERANDA.
   - Mírně **nad** posledním obloukem tratě, nebo s malou mezerou od čáry — šipka se nesmí vizuálně spojit s magenta/orange okruhem.
   - Žádné zalomení, jedna úsečka + hlavice.

Na úzkém viewportu šipka dál skrytá.

## Mimo scope

- SVG mapy, místopis, další sekce, push.

## Akceptace

- [ ] Šipka 80 % opacity, slabší než trať.
- [ ] Není čitelné jako součást okruhu.
- [ ] Start na hraně boxu, konec u S/C, ne přes VERANDA / 4. KM.
- [ ] `pnpm lint && pnpm format:check`.

## Hotovo

Screenshot cs desktop. Nic nepushovat.
