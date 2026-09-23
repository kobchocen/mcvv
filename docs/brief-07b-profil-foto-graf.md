# Brief 07b — Portrét z webimages + graf výkonnosti

Pro vývojového agenta v `~/clients/kobchocen/mcvv/web`.  
**Push zakázán.** Tabulku výsledků, kluby, souhrn nesahej kromě sloupce grafu.

## Portrét

Legacy: `cis_bezec` LEFT JOIN `webimages` ON `bezec_id`. Když image chybí, fallback `webimages.id = 1` (obecný placeholder).

**Nečti BLOB v RSC / v page.tsx.**  
Nový (nebo existující) route např. `/api/bezec-foto?id=` — jen ten id, 24h cache, `image/jpeg`. Na profilu `<img src="…">` vlevo od jména / boxu, max ~160–200 px. Když endpoint vrátí 404, img vynech.

Nepoužívej `/api/test/fotka`.

## Graf výkonnosti

Do tabulky sloupec **Graf** (legacy „Graf výkonnosti“).

Tři CSS pruhy v jedné řadě, výška ~12 px, význam jako `profil.php`:

| Barva   | Co                                                                                             |
| ------- | ---------------------------------------------------------------------------------------------- |
| modrá   | ztráta osobního rekordu na **traťový rekord pohlaví** (`min(time)` stejné pohlaví, 5. znak id) |
| zelená  | ztráta daného roku na **osobní rekord** (část pod průměrem)                                    |
| červená | ztráta nad **průměrný čas** běžce                                                              |

Šířka úměrná sekundám (stejné px/s pro všechny tři). Tooltip: ztráta na traťový rekord / na OS / na průměr.

Žádné GD, žádný canvas library. Mobil: sloupec může být pod časem, ať tabulka nepřeteče.

## Mimo scope

- Mřížka závodních fotek (už je).
- Push.

## Akceptace

- [ ] Profil s portrétem (nebo čistě bez img při 404).
- [ ] Graf u každého roku, OS má krátkou/žádnou zelenou.
- [ ] lint + format:check.

## Hotovo

Screenshot Pavla Švadleny nebo Paprčky (hlava + 2–3 řádky s grafem). Nic nepushovat.
