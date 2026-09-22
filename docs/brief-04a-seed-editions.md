# Brief 04a — Data ročníků do `mcvv_info` / `cis_mcvv_kateg`

Pro vývojového agenta v `~/clients/kobchocen/mcvv/web`.  
**Push zakázán. UI v tomto briefu neměň** (to je 04 + 04b).

## Kontext

Admin modul není. Tabulky v Prisma už jsou (`Edition` → `mcvv_info`, `Category` → `cis_mcvv_kateg`). Chybí **řádky ročníků 1–33** a analogický **34. ročník 2026**.

Dumpy (phpMyAdmin, 4. 1. 2026) owner nahrál:

- `dumps/mcvv_info.sql` / artifacts `mcvv_info.sql` — 33 řádků, id 1–33, poslední **2025-12-07**
- `dumps/cis_mcvv_kateg.sql` — 13 kategorií

Kategorie: když seed už naplnil tabulku, jen zkontroluj počet. Ročníky seed neplní.

## Cíl

1. Import **jen INSERT** (tabulky už existují z Prisma — nespouštěj `CREATE TABLE` / `ALTER` z dump).
   `'0000-00-00'` u `prihl_datum` → `NULL`.
   Vloni (33): startovné 50/100 děti, 100/200 dospělí, ceny 3000…100 / 500…200, `zhl=0`, interval 15, mail `mcvv@mcvv.org`.
2. Importovat do dev DB (`DATABASE_URL` z `@/lib/env`). Idempotentně: nezdvojovat PK.
3. Po importu vzít poslední ročník (max `date` / max `id`) a **vložit 2026**:
   - `datum` / `date` = **2026-12-06**
   - `id` = poslední id + 1 (očekávaně **34**, ověř)
   - `zhl` = **0** (2026 není ZHL; vloni taky ne)
   - startovné a prize money **zkopírovat z posledního řádku**
   - `prihl_datum`: nech `NULL` nebo stejný posun jako vloni vůči datu závodu — **ne** loňské absolutní datum
   - počasí/teplota 2026 prázdné (závod ještě nebyl)
4. Žádná změna sloupce, žádný admin.

Ověření:

```sql
SELECT id, datum, zhl, start_dosp_mail, start_dosp_mist FROM mcvv_info ORDER BY datum;
-- poslední dva řádky: loňský + 2026-12-06, zhl=0, stejné startovné
SELECT COUNT(*) FROM cis_mcvv_kateg;
```

## Mimo scope

- UI, přihlášky, push, produkční DB.

## Akceptace

- [ ] 33 historických řádků z dump (ne vymyšlených).
- [ ] Řádek 2026-12-06, id navazující, zhl=0, fees jako vloni.
- [ ] Kategorie existují.
- [ ] Když dump chybí, žádný falešný insert — jen hlášení.

## Hotovo

Počet řádků `mcvv_info`, id+datum posledních dvou, odkud dump byl. Nic nepushovat.
