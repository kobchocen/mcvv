package main

import (
	"bufio"
	"bytes"
	"fmt"
	"strconv"
	"strings"
)

// Punch je jeden řádek exportu OBD: startovní číslo a čas od individuálního startu v sekundách.
type Punch struct {
	Bib   int
	TimeS int
}

// Key jednoznačně identifikuje odeslanou hodnotu (číslo + čas). Server je idempotentní
// na stejném klíči, takže opakované odeslání nevadí.
func (p Punch) Key(split string) string {
	return fmt.Sprintf("%s:%d:%d", split, p.Bib, p.TimeS)
}

// ParseResult obsahuje platné řádky a počet přeskočených (hlavička, prázdné, nesmysl).
type ParseResult struct {
	Punches []Punch
	Skipped int
}

// ParseSplitsCSV čte export ve formátu legacy `tmp/splits.csv`: `cislo;time_s` bez hlavičky.
// Tolerantní: oddělovač `;`, `,` nebo tabulátor; UTF-8 BOM; CRLF; čas i jako m:ss nebo h:mm:ss;
// hlavička a řádky bez čísla se přeskočí. Když je číslo v souboru vícekrát, platí poslední řádek.
func ParseSplitsCSV(data []byte) ParseResult {
	data = bytes.TrimPrefix(data, []byte{0xEF, 0xBB, 0xBF})
	var result ParseResult
	index := map[int]int{}
	scanner := bufio.NewScanner(bytes.NewReader(data))
	scanner.Buffer(make([]byte, 64*1024), 1024*1024)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" {
			continue
		}
		fields := strings.FieldsFunc(line, func(r rune) bool { return r == ';' || r == ',' || r == '\t' })
		if len(fields) < 2 {
			result.Skipped++
			continue
		}
		bib, err := strconv.Atoi(strings.Trim(strings.TrimSpace(fields[0]), `"`))
		if err != nil || bib <= 0 || bib > 9999 {
			result.Skipped++
			continue
		}
		timeS, ok := parseTime(strings.Trim(strings.TrimSpace(fields[1]), `"`))
		if !ok {
			result.Skipped++
			continue
		}
		punch := Punch{Bib: bib, TimeS: timeS}
		if i, seen := index[bib]; seen {
			result.Punches[i] = punch
			continue
		}
		index[bib] = len(result.Punches)
		result.Punches = append(result.Punches, punch)
	}
	return result
}

// parseTime přijme sekundy (1686), m:ss (28:06) nebo h:mm:ss (0:28:06). Limit 6 h jako na serveru.
func parseTime(value string) (int, bool) {
	if value == "" {
		return 0, false
	}
	parts := strings.Split(value, ":")
	if len(parts) > 3 {
		return 0, false
	}
	total := 0
	for i, part := range parts {
		n, err := strconv.Atoi(part)
		if err != nil || n < 0 || (i > 0 && n >= 60) {
			return 0, false
		}
		total = total*60 + n
	}
	if total <= 0 || total > 6*3600 {
		return 0, false
	}
	return total, true
}
