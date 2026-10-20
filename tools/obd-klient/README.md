# obd-klient

Malý program pro cílový počítač s OBD: hlídá export `splits.csv` a posílá nové časy do webu MČVV
(`POST /api/race/{rok}/splits`). Jeden `.exe`, bez instalace a bez práv správce.

## Použití

1. V `/admin/den-zavodu/zive` vytvořte klíč zařízení (úsek `9` = cíl). Token se zobrazí jen jednou.
2. Vedle `obd-klient.exe` uložte `config.json` (vzor `config.example.json`) s URL webu, tokenem,
   ročníkem a cestou k exportu (`C:\OBD\tmp\splits.csv`). Token lze dát i do proměnné `MCVV_TOKEN`.
3. `obd-klient.exe -check` ověří token a spojení. Pak spusťte `obd-klient.exe` a nechte okno běžet.

Klient čte soubor každých `intervalS` sekund (výchozí 5), posílá jen řádky, které server ještě
nepotvrdil (`state.json` vedle configu), při výpadku sítě opakuje s backoffem (max. `maxBackoffS`).
Opakované odeslání je bezpečné – server je idempotentní. Konflikty (jiný čas u čísla, které už čas má)
klient vypíše a rozhodne o nich admin na webu.

Formát souboru a předpoklady: `docs/DEN-ZAVODU-MEZICASY.md`.

## Vývoj

```sh
go test ./...
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath -ldflags "-s -w -X main.version=0.1.0" -o dist/obd-klient.exe .
```

Binárky se necommitují; CI je sestaví jako artefakt `obd-klient-windows-amd64`.
