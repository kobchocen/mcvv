# Brief 03b — Mapa tratě SVG v sekci Termín a místo

Pro vývojového agenta v `~/clients/kobchocen/mcvv/web`.  
**Push zakázán. Profil tratě nesahej.** Countdown, 10:15 a CTA z briefu 03 neměň, pokud už fungují.

## Kontext

Filtrované `trasa.jpg` v kartě mapy vizuálně spadlo. Owner dodal vektor z Affinity.

Zdroj **už je v repo:** `public/images/mcvv-trasa.svg`  
(stejný soubor je i v artifacts tohoto projektu).

Vrstvy (`id` / Affinity):

- Podklad: `Louky`, `Parkoviště`, `Řeka`, `Vrstevnice`, `Potoky`, `Železnice`, `Cesty`
- `Trasa` — růžová čára
- `Popisky` — S/C, kopce 1–4, 1.–4. KM, M1, M2
- `Místopis` — Veranda, Sutina, Zítkov, Tichá Orlice, Choceň, Dívčí doly, Trojhránek, Písáček, Brod, Formanka

## Cíl

V sekci 03 nahradit rastrovou mapu tímto SVG. Stylovat **v CSS podle skupin**, ne hue-rotate přes celý obrázek. Zachovat layout karty (overlay CHOCEŇ — VELKÁ VERANDA, box START · CÍL, pin u Verandy).

## Implementace

1. V `mcvv-schedule-section` (nebo kde je mapa) přestat používat filtrované `trasa.jpg` jako hlavní vizuál.
2. Vykreslit SVG:
   - buď inline (import jako React komponenta / SVGR), ať jde barvit skupiny,
   - nebo `<img src="/images/mcvv-trasa.svg">` + **oddělený CSS** nepůjde na vnitřní `id`. Preferuj **inline**.
3. Barvy z tokenů webu (dark default):
   - pozadí karty `race-deep`
   - `#Vrstevnice` tenké, muted (nízký kontrast)
   - `#Cesty` / `#Železnice` dim
   - `#Řeka` / `#Potoky` tlumená modrá-zelená
   - `#Louky` / `#Parkoviště` ztlumit (žlutá z OCAD na dark křičí)
   - `#Trasa` `race-accent`, silnější stroke
   - popisky a místopis čitelné na tmavém podkladu (ne magenta boxy)
4. Žádný `brightness/contrast/saturate/hue-rotate` na celou mapu.
5. Text v SVG **needituj**. Affinity export rozseká diakritiku do `tspan` (O+Á+Č…). Změna názvu = nový export od ownera, ne search-replace v gitu.
6. Vrstvy neořezávej. Vypínače (schovat `#Místopis` atd.) v tomto briefu **nedělej** — jen barvy a sazba v kartě.
7. Overlay webu nech: „CHOCEŇ — VELKÁ VERANDA“, START · CÍL + „Velká Veranda, Choceň“. Pin na S/C (pravý dolní roh).
8. Light theme: mapa musí zůstat čitelná, ne černá díra.
9. Mobile: mapa `width 100%`, `height auto`, `viewBox` z SVG zachovat. Nesmí vytéct z karty.
10. `trasa.jpg` z UI sekce 03 pryč; soubor v `public/images/trasa.jpg` může zůstat ležet.

## Mimo scope

- Profil tratě, `/program`, přihlášky, push.
- Překreslování SVG, slučování pathů, optimalizace 1 MB.

## Akceptace

- [ ] V sekci 03 je `mcvv-trasa.svg`, ne filtrované JPG / Dark Woods.
- [ ] Trať oranžová/accent, podklad tmavý, vrstevnice čitelné.
- [ ] Vidět kopce 1–4, km, M1/M2, Formanka i ostatní místopis.
- [ ] Overlay + pin + adresa bez „Restaurace“.
- [ ] Countdown a CTA beze změny chování.
- [ ] Desktop + mobile.
- [ ] `pnpm lint && pnpm format:check`.
- [ ] Žádný diff v `mcvv-profile-section.tsx`.

## Hotovo

Screenshot cs desktop sekce 03 + seznam souborů. Nic nepushovat.
