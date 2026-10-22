#!/bin/sh
# Sestaví balíček pro časomíru: dist/obd-klient-$VERSION/ a dist/obd-klient-$VERSION-win-x64.zip
#   VERSION=0.1.1 COMMIT=abc1234 ./build-release.sh
# Potřebuje go, zip a sha256sum (CI: ubuntu; lokálně: Docker golang:1.25 + apt-get install zip).
# Ikonu, manifest a údaje o verzi (Vlastnosti → Podrobnosti) vloží go-winres.
set -eu
cd "$(dirname "$0")"
VERSION=${VERSION:?nastavte VERSION=X.Y.Z}
COMMIT=${COMMIT:-$(git rev-parse --short=7 HEAD 2>/dev/null || true)}
case "$VERSION" in
  *[!0-9.]* | .* | *. | *..*) echo "VERSION musí být X.Y.Z, je: $VERSION" >&2; exit 2 ;;
esac
NAME="obd-klient-$VERSION"
OUT="dist/$NAME"
ZIP="dist/$NAME-win-x64.zip"
rm -rf "$OUT" "$ZIP" rsrc_windows_*.syso
mkdir -p "$OUT"

go run github.com/tc-hib/go-winres@v0.3.3 make --in winres/winres.json --arch amd64 \
  --product-version "$VERSION" --file-version "$VERSION"
GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -trimpath \
  -ldflags "-s -w -X main.version=$VERSION -X main.commit=$COMMIT" -o "$OUT/obd-klient.exe" .
rm -f rsrc_windows_*.syso

# Poznámkový blok: UTF-8 s BOM a CRLF
crlf() { sed 's/\r$//; s/$/\r/' "$1"; }
{ printf '\357\273\277'; crlf balik/NAVOD.txt; } > "$OUT/NAVOD.txt"
crlf balik/splits-ukazka.csv > "$OUT/splits-ukazka.csv"
crlf config.example.json > "$OUT/config.example.json"
(cd "$OUT" && sha256sum obd-klient.exe | sed 's/$/\r/' > obd-klient.exe.sha256)

(cd dist && zip -X -q -r "$NAME-win-x64.zip" "$NAME")
(cd dist && sha256sum "$NAME-win-x64.zip" > "$NAME-win-x64.zip.sha256")
cat "$OUT/obd-klient.exe.sha256" "dist/$NAME-win-x64.zip.sha256"
