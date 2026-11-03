# Termíny přihlášek a startovné (sloty)

Zdroj termínů a startovného ročníku je tabulka `mcvv_prihl_slot` (klíč `rok` + `typ`):

| typ        | veřejně                         | stav v části 1                                      |
| ---------- | ------------------------------- | --------------------------------------------------- |
| `early`    | brzké přihlášky                 | volitelné, výchozí vypnuté                          |
| `standard` | standardní přihlášky            | konec = uzávěrka (`prihl_datum`)                    |
| `late`     | pozdní přihlášky                | seed vypnutý, zapne se s částí 2 (pozdní přihlášky) |
| `onsite`   | přihlášky na místě (den závodu) | jen ceník a časy závodní kanceláře                  |

- `od` / `do` jsou v UTC, `do` je exkluzivní. V administraci se zadávají v pražském čase.
- Startovné je podle skupiny kategorie (`mcvv_kateg_meta.skupina`: `dospeli` / `mladez`).
  Kategorie bez skupiny nebo ročník bez slotů → cena z číselníku kategorií (dosavadní chování).
- Ročník bez slotů se chová jako dřív: přihlášky otevřené do konce dne uzávěrky.
- Z webu lze přihlášky přidávat a měnit jen v běžícím aktivním termínu `early` / `standard`
  (`currentRaceYear().open`). Po konci standardu jsou přihlášky uzamčené.

Nastavení ročníku (`mcvv_info`):

| sloupec             | význam                                                         | výchozí               |
| ------------------- | -------------------------------------------------------------- | --------------------- |
| `prihl_otevreni`    | začátek online přihlášek (nejdřívější aktivní early/standard)  | ze slotů              |
| `doplatek_std_do`   | lhůta doplatku nezaplacených standardních přihlášek            | den po uzávěrce 12:00 |
| `doplatek_std_mail` | čas e-mailu „zaplaťte dnes“ v den lhůty (s od půlnoci)         | 25200 (7:00)          |
| `kancelar_od`       | otevření závodní kanceláře v den závodu (s od půlnoci)         | 32400 (9:00)          |
| `na_miste_do`       | konec přihlášek na místě (s od půlnoci); texty `{onsiteUntil}` | 35100 (9:45)          |

Administrace: `/admin/rocniky/[id]` → sekce **Termíny a startovné** (`saveEditionSlots`). Uložení
synchronizuje `prihl_datum`, `prihl_otevreni` a startovné online / na místě v `mcvv_info`; úprava
uzávěrky, startovného nebo data v hlavním formuláři ročníku se promítne do slotů `standard`
a `onsite`.

Migrace `20261104120000_registration_slots` založí sloty 2026 ze stávajících dat (standard
od 1. 9. do konce uzávěrky, late vypnutý 200 / 100 Kč, na místě 9:00–9:45 200 / 100 Kč)
a skupiny kategorií (věk 1–19 = mládež).

Veřejné texty nikdy neříkají „slot“ ani nezmiňují pořadatele u startovného zdarma.
