# Brief 05c — 02: stejná výška mapa a profil

Pro vývojového agenta v `~/clients/kobchocen/mcvv/web`.  
**Push zakázán.** Křivku, modal, overlay, osu km a copy 03 nesahej.

## Cíl

V sekci 02 sladit **výšku karty mapy a karty profilu** na desktopu.

Teď je mapa nízký čtverec a profil vysoký pás.  
**Mapu zvětši, profil proporcionálně sniž**, ať oba boxy mají stejnou vnější výšku (včetně rámečku START·CÍL na mapě a claimu + osy na profilu).

- Jedna výška sloupce (grid / flex `items-stretch`, obě karty `h-full`).
- Mapa vyplní svůj box (`object-contain` / SVG `width/height 100%`), nepřetéká.
- Profil: křivka se přizpůsobí nižšímu boxu, osa km a kopce 1–4 zůstanou čitelné. Data bodů neměň.
- Mobil: pod sebou, každá karta vlastní výšku — nesahej.

## Akceptace

- [ ] Desktop: mapa a profil vizuálně stejná výška.
- [ ] Modal mapy pořád funguje.
- [ ] 4 km na ose, overlay TRAŤ ZÁVODU.
- [ ] lint + format:check.

## Hotovo

Screenshot 02 desktop. Nic nepushovat.
