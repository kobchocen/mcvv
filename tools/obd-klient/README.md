# obd-klient

Malý program pro cílový počítač s OBD (Windows 11, amd64): hlídá soubor s mezičasy, který OBD
zapisuje stejně jako pro legacy web, a posílá časy do webu MČVV (`POST /api/race/{rok}/splits`).
Jeden `.exe`, bez instalace a bez práv správce. OBD ani jeho obsluha nic nemění.

## Použití

1. V `/admin/den-zavodu/zive` vytvořte klíč zařízení (úsek `9` = cíl). Token se zobrazí jen jednou.
2. Spusťte `obd-klient.exe`. Při prvním spuštění (bez `config.json`) se zeptá na adresu webu,
   klíč, ročník a **cestu a název souboru s mezičasy** a uloží `config.json` vedle `.exe`.
   Nastavení lze kdykoli změnit `obd-klient.exe -setup`, cestu jednorázově `-file C:\…\splits.csv`,
   nebo ručně v `config.json` (vzor `config.example.json`). Token lze dát i do proměnné `MCVV_TOKEN`.
3. `obd-klient.exe -check` ověří token a spojení. Pak nechte okno běžet.

Formát souboru je 1:1 s legacy `online/index_cHc_0607.php`: `cislo;time_s` (čas od startu
v sekundách), bez hlavičky, jedna řádka na číslo; když je číslo v souboru vícekrát, platí první
řádek. Klient navíc snese `,`/tab, BOM, CRLF, hlavičku a čas `m:ss` / `h:mm:ss`.

OBD každých 60 s přepíše celý soubor. Klient čte soubor každých `intervalS` sekund (výchozí 5)
a posílá nové řádky. **Výchozí chování je 1:1 s legacy** (rozhodnutí Pavla, Q22): platí první
zapsaný čas. Změněný čas se pošle jednou a na webu se ukáže jako konflikt pro admina (nic se
nepřepíše), zmizelý řádek se nemaže. Za přepínači v `config.json` (výchozí `false`):

- `"applyCorrections": true` – změněný čas v OBD přepíše čas, který dřív poslalo OBD (čas zadaný
  člověkem na webu se nepřepíše nikdy, vznikne konflikt);
- `"deleteMissing": true` – řádek, který chybí ve `missingSnapshots` (výchozí 2) po sobě jdoucích
  verzích souboru, se smaže i na webu. Prázdný nebo výrazně kratší soubor nic nemaže.

Stav (`state.json` vedle configu) zajistí, že se po restartu neposílá všechno znovu; při výpadku sítě
klient opakuje s backoffem (max. `maxBackoffS`). Opakované odeslání je bezpečné – server je idempotentní.

Podrobnosti: `docs/DEN-ZAVODU-MEZICASY.md`.

## Vývoj

```sh
go test ./...
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-s -w -X main.version=0.2.0" -o dist/obd-klient.exe .
```

Binárky se necommitují; CI je sestaví jako artefakt `obd-klient-windows-amd64` (Windows 10/11, x64).
