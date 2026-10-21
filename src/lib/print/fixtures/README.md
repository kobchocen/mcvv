# Legacy čárový kód – referenční vzorky

`legacy-barcode.json` vznikl spuštěním **neupraveného** legacy `admin/barcode.php`
(starý web MCVV, sha256 `0f3488a9…2a9cdb`) v PHP 8.3 + GD (Docker `alpine:3.20`,
balíčky `php83 php83-gd zbar imagemagick`) se stejnými parametry, jaké používal
`admin/tiskcisel.php`:

```
barcode.php?text={cislo}&sizefactor=2&size=60&orientation=vertical
```

Pro každé číslo se uložila velikost PNG a běhy pixelů ve sloupci `x = 30` shora dolů
(`0` bílá, `1` černá, za číslicí délka v px) a výsledek `zbarimg` (`CODE-128:{cislo}`).
Test `code128.test.ts` porovnává nový kodér s těmito vzorky pixel po pixelu.
