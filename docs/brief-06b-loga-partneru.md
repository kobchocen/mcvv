# Brief 06b — Loga partnerů

Pro vývojového agenta + owner.

## Kam soubory

`public/partners/`  
Jméno souboru **přesně** jako sloupec `sponsors.image` (např. `starmon.png`, `iveco.svg`).

Owner: zkopíruj loga z legacy `images/partneri/` (jsou i v `mcvv.org.zip`) na Mini:

```bash
mkdir -p public/partners
# z rozbaleného zipu nebo z artifacts
cp cesta/images/partneri/* public/partners/
```

Když se `image` v DB neshoduje s názvem souboru, buď přejmenuj soubor, nebo uprav jen ten sloupec — **nemen** layout.

## UI

Sekce 06: když soubor existuje, **logo** (contain, max výška ~48–64 px, světlý podklad může zůstat). Když ne, název jako teď.  
`alt` = název partnera. Odkaz na `url` z DB, `rel="noopener"`.

Žádný nový CMS.

## Akceptace

- [ ] Většina karet má logo, ne samý text.
- [ ] Chybějící soubor nespadne build.

## Hotovo

Screenshot sekce 06 + seznam souborů, které v DB jsou a na disku chybí.
