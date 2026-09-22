# Brief 07 — Profil běžce dle legacy

Pro vývojového agenta v `~/clients/kobchocen/mcvv/web`.  
**Push zakázán.** Statistiky a 02/03 nesahej.

Vzor: `profil.php`. Stránka `/bezec/[id]`. Navbar už je.

## Nahoře

- Jméno, `* rok narození` (první 4 znaky id).
- Box (jako 01 karty): **počet účastí**, **osobní rekord**, **průměrný čas**, **poslední účast** (rok).
- Titulek boxu = **poslední známý klub** (join `cis_klub` id+rok, stejný jako výsledky). Když nic, titulek vynech.

Fotku z `webimages` BLOB **netahaj do RSC**. Když už existuje endpoint na fotku běžce, použij ho; jinak profil bez portrétu.

## Tabulka výsledků

Sloupce: **rok** | **čas** | **ztráta na OS** | **klub** | **kategorie**

- Rok odkaz na `/results/[rok]` (kotva na id, pokud na listině existuje).
- Ztráta = čas − osobní rekord, u rekordu `0:00` nebo „OS“.
- Klub stejným joinem jako `/results/[year]` — na profilu Pavla Švadleny teď „—“ u všech let, to je bug.
- Řazení rok DESC (novější nahoře) — legacy bylo ASC; owner čte odzadu, drž DESC jako účast.

Graf výkonnosti z legacy (modrá/zelená/červená GD) **nedělej** v tomto briefu. Až bude box a kluby.

## Fotky

Pokud je vazba `mcvv_bezec_fotka` v Prismě: mřížka náhledů přes existující `/api/fotka?id=`, bez BLOB v RSC. Když model není, přeskoč a napiš to v hotovo.

## Chrome

- „Zpět na archiv výsledků“ → **Archiv výsledků** (`/results`), bez „Zpět na“.
- 404 text, když id nemá žádný čas.

## Mimo scope

- Push, SMTP, light theme, mapa.

## Akceptace

- [ ] Čtyři čísla nahoře, kluby v tabulce, ztráta na OS.
- [ ] `/bezec` Pavla Švadleny bez pomlček u klubu.
- [ ] lint + format:check.

## Hotovo

Screenshot profilu Pavla Švadleny (horních ~15 řádků). Nic nepushovat.
