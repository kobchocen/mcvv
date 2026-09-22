# Brief 07c — Profil: sazba, fotky, pódium, hledání

Pro vývojového agenta v `~/clients/kobchocen/mcvv/web`.  
**Push zakázán.** API portrétu a výpočet grafu nesahej, jen UI a nové prvky níž.

## Profil — sazba

- Portrét **svisle zarovnat s info boxem** (stejný top, box natažený vedle fotky).
- Řádek osobního rekordu: odznak **OR** (ne OS).
- Label sloupce: **Ztráta na OR** (ne OS). V buňce u rekordu **OR**.
- Hlavička sloupce grafu: **Graf výkonnosti**.

## Portrét

Když běžec **nemá** řádek v `webimages`, **žádný img** (ani fallback id=1). Endpoint ať v tom případě 404. Doucha Jiří teď ukazuje oříznuté logo závodu — pryč.

## Fotky na profilu

- Řazení **rok DESC** (nejnovější první).
- Prvních **12**, tlačítko **Načíst další** po 12, dokud zbývají.
- Klik → **modal** plné velikosti (`/api/fotka?id=`), zavřít Escape / křížek / klik mimo. Stejný vzor jako modal mapy.
- U každé miniatury **rok** (overlay roh nebo popisek pod fotkou). V modalu rok znovu (titulek / caption), případně `popis` z DB pokud je.

## Pódium v tabulce

U roku odznak:

- **velká medaile** (zlato/stříbro/bronz) — pódium **absolutní** kategorie muži nebo ženy (ne věková)
- **malá medaile** — pódium jen ve **věkové** kategorii

Obojí může být najednou. Bez pódia nic.

## Výsledky ročníku

Odkaz z profilu `/results/[rok]#[id]` musí **scrollnout a zvýraznit řádek** toho běžce (background race-accent/10, vydrží). Kotva už v URL je — doteď se nedeje nic viditelného.

## Landing — hledání běžce

Input s našeptávačem. Návrh místa: **sekce 04** nad kartami (Výsledky a statistiky), plná šířka sloupce, placeholder „Hledat běžce…“.

Chování:

- od 2 znaků query na jméno (`cis_bezec.jmeno`)
- max 8 návrhů: jméno + rok nar.
- Enter / klik → `/bezec/[id]`
- žádný fulltext přes klub

Endpoint malý (RSC action nebo `/api/bezci?q=`), žádný dump celé tabulky do klienta.

## Mimo scope

- Změna vzorce grafu, SMTP, push.

## Akceptace

- [ ] Doucha bez placeholder loga.
- [ ] OR odznak + labely.
- [ ] 12 fotek + další + modal.
- [ ] Medaile absolutní vs věk.
- [ ] Zvýrazněný řádek na `/results/2025#id`.
- [ ] Hledání v 04.
- [ ] lint + format:check.

## Hotovo

Screenshot Michalova profilu (hlava + OR řádek + fotky) a 04 s hledáním. Nic nepushovat.
