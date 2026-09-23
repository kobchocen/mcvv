# Brief 05b — 02/03: menší mapa, modal, copy

Pro vývojového agenta v `~/clients/kobchocen/mcvv/web`.  
**Push zakázán.** Data křivky (body, kopce 1–4, 286/343 m) **nemen** — jen sazba a osa km.

## 02 Trať

1. **Mapa výrazně menší** (cca polovina dnešní výšky karty). Sekce nižší, **víc šířky profilu**.
2. Klik na mapu → **modal** s velkou mapou (stejné SVG, overlay START·CÍL může zůstat). Zavřít křížkem / Escape / klik mimo. `aria-modal`, focus trap není nutný dokonalý, ale Escape ano. Tělo mapy `cursor: zoom-in`, `button` nebo `role="button"`.
3. Popisek overlay: **TRAŤ ZÁVODU** (ne jen TRAŤ).
4. **Osa km pod profilem** — značky znovu sladit s křivkou. Musí být **START, 1 km, 2 km, 3 km, 4 km, CÍL · 4,3 km**. Chybějící **4 km** vrátit. Žádný posun mimo ticks.
5. Věta „Výškový profil tratě, který nepustí. Každý metr převýšení je znát.“ **dovnitř boxu profilu** (nad nebo pod křivkou v kartě), ne vedle nadpisu.
6. Heading „Čtyři kopce. Čtyři seběhy. Žádné výmluvy.“ na **jeden řádek** na desktopu (`whitespace-nowrap` / menší display size, pokud teče). Mobil smí zalomit.

## 03 Termín a místo

7. Řádek místa: **„Choceň - Velká Veranda - GPS: 49°59'45"N, 16°12'10"E“**.  
   Klik na GPS (ne na celý řádek) otevře Google mapu (`https://goo.gl/PT3Eoq` nebo maps query těchto souřadnic) do nového tabu.
8. Box **Centrum** pryč. Odkaz „Otevřít mapu“ v 03 pryč (GPS to nahrazuje).
9. **Vlakem:** pryč „(trať 010)“. „asi 2 km“ → **„celkem 2 km“**. „levým břehem“ → **„po levém břehu“**. Cíl: text na ~2 řádky.
10. **Autem:** pryč obě **„asi“** (1 km za Chocní, 300 m pěšky, 500 m po zelené — bez „asi“).
11. Tlačítko **Přihlásit se** v sekci 03 **smazat**. Countdown nech.

## Mimo scope

- Nová křivka, nová data mapy, formulář, push.

## Akceptace

- [ ] Mapa menší, modal funguje, overlay TRAŤ ZÁVODU.
- [ ] Osa: 4 km vidět, ticks sedí.
- [ ] Claim profilu v boxu, heading 1 řádek desktop.
- [ ] GPS odkaz, bez boxu Centrum a bez CTA v 03.
- [ ] Copy vlak/auto dle 9–10.
- [ ] cs i en, lint + format:check.

## Hotovo

Screenshot 02+03 desktop. Nic nepushovat.
