# Brief 03g — Šipka: souřadnice vůči mapě (poslední úprava 03)

Pro vývojového agenta v `~/clients/kobchocen/mcvv/web`.  
**Push zakázán. Profil nesahej.** Nic jiného v sekci 03.

## Proč to pořád míří vedle

Šipka je navázaná na **střed pravé hrany boxu**. Box a tečka S/C žijí v jiném souřadném systému; při škálování karty se Y rozjede. Proto „pořád míří jinam“.

## Cíl

Souřadnice šipky počítej v **procentech overlaye mapy** (stejný wrapper jako SVG), ne od středu boxu.

1. V DevTools najdi střed tečky **S/C** na desktopu (teď cca pravý dolní roh mapy). Zapiš jako `%left` / `%top` wrapperu.  
   Očekávaný řád: konec šipky zhruba **`left: 86–90%`, `top: 82–88%`** — ověř na aktuálním layoutu, nehádej.
2. **Konec** = tyto % (těsně před tečkou, ~8–12 px vlevo od středu S/C).
3. **Začátek** = `left` = pravý okraj boxu START · CÍL v tom samém wrapperu, **`top` stejné jako konec**. Úsečka je vodorovná ve výšce S/C, i když to není střed boxu. Smí se napojit na rámeček níž než střed — to je správně.
4. Opacity 80 %, tenčí než trať — beze změny.

Když box změní výšku, šipka se nesmí hýbat s jeho středem.

## Mimo scope

- Další vizuál sekce 03, SVG, push.

## Akceptace

- [ ] Hlavice u tečky S/C na desktopu (ne u nápisu VERANDA, ne do vzduchu).
- [ ] Start na pravé hraně boxu, stejná Y jako konec.
- [ ] `pnpm lint && pnpm format:check`.

## Hotovo

Jeden screenshot desktop. Tím se **sekce 03 uzavírá**. Nic nepushovat.
