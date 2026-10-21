package main

import (
	"bufio"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// Cestu a název souboru s mezičasy zadá obsluha (OBD ani LuM se nemění): v config.json (`file`),
// parametrem `-file`, nebo dotazem při prvním spuštění (`runSetup`, znovu přes `-setup`).

const defaultURL = "https://www.mcvv.org"

// interactive: běží v okně konzole (ne jako služba / s přesměrovaným vstupem).
func interactive() bool {
	info, err := os.Stdin.Stat()
	return err == nil && info.Mode()&os.ModeCharDevice != 0
}

// loadConfigWithFile načte config a případně přepíše cestu k souboru parametrem `-file`.
func loadConfigWithFile(path, file string) (Config, error) {
	cfg, err := readConfig(path)
	if err != nil {
		return cfg, err
	}
	if file = cleanInput(file); file != "" {
		cfg.File = file
	}
	return cfg, cfg.validate()
}

// cleanInput ořízne mezery a uvozovky okolo hodnoty: Průzkumník („Kopírovat jako cestu“,
// Ctrl+Shift+C) i přetažení souboru do okna konzole vkládají cestu v uvozovkách.
func cleanInput(value string) string {
	value = strings.TrimSpace(value)
	for _, quote := range []string{`"`, `'`} {
		if len(value) >= 2 && strings.HasPrefix(value, quote) && strings.HasSuffix(value, quote) {
			value = strings.TrimSpace(value[1 : len(value)-1])
		}
	}
	return value
}

// runSetup se zeptá na URL, token, ročník a cestu k souboru a uloží config.json (práva 0600).
// Stávající hodnoty nabídne jako výchozí (Enter = ponechat).
func runSetup(path string, in io.Reader, out io.Writer, fileFlag string) error {
	current := map[string]any{}
	if data, err := os.ReadFile(path); err == nil {
		_ = json.Unmarshal(data, &current)
	}
	str := func(key, fallback string) string {
		if value, ok := current[key].(string); ok && value != "" {
			return value
		}
		return fallback
	}
	year := time.Now().Year()
	if value, ok := current["year"].(float64); ok && value > 0 {
		year = int(value)
	}
	reader := bufio.NewReader(in)
	ask := func(label, fallback string, check func(string) error) (string, error) {
		for {
			if fallback != "" {
				fmt.Fprintf(out, "%s [%s]: ", label, fallback)
			} else {
				fmt.Fprintf(out, "%s: ", label)
			}
			line, err := reader.ReadString('\n')
			if err != nil && !(errors.Is(err, io.EOF) && line != "") {
				return "", fmt.Errorf("vstup ukončen")
			}
			value := cleanInput(line)
			if value == "" {
				value = fallback
			}
			if problem := check(value); problem != nil {
				fmt.Fprintf(out, "  %v\n", problem)
				continue
			}
			return value, nil
		}
	}
	fmt.Fprintf(out, "Nastavení obd-klienta (uloží se do %s). Enter = hodnota v závorce.\n", path)
	url, err := ask("Adresa webu", str("url", defaultURL), func(v string) error {
		if !strings.HasPrefix(v, "https://") {
			return errors.New("adresa musí začínat https://")
		}
		return nil
	})
	if err != nil {
		return err
	}
	tokenHint := ""
	if strings.HasPrefix(str("token", ""), "mcvv_live_") && !strings.Contains(str("token", ""), "SEM_VLOZTE") {
		tokenHint = "ponechat uložený"
	}
	token, err := ask("Klíč zařízení z /admin/den-zavodu/zive (mcvv_live_…)", tokenHint, func(v string) error {
		if v == "ponechat uložený" || strings.HasPrefix(v, "mcvv_live_") {
			return nil
		}
		return errors.New("klíč začíná mcvv_live_")
	})
	if err != nil {
		return err
	}
	if token == "ponechat uložený" {
		token = str("token", "")
	}
	yearText, err := ask("Ročník", strconv.Itoa(year), func(v string) error {
		if n, err := strconv.Atoi(v); err != nil || n < 2000 || n > 2100 {
			return errors.New("zadejte rok, např. 2026")
		}
		return nil
	})
	if err != nil {
		return err
	}
	fileDefault := fileFlag
	if fileDefault == "" {
		fileDefault = str("file", "")
	}
	file, err := ask("Cesta k souboru s mezičasy z OBD (např. C:\\OBD\\tmp\\splits.csv)", fileDefault, func(v string) error {
		if v == "" {
			return errors.New("zadejte cestu k souboru")
		}
		if _, err := os.Stat(v); err != nil {
			fmt.Fprintf(out, "  Upozornění: soubor zatím neexistuje (%v). OBD ho vytvoří; klient počká.\n", err)
		}
		return nil
	})
	if err != nil {
		return err
	}
	current["url"] = url
	current["token"] = token
	current["year"], _ = strconv.Atoi(yearText)
	current["file"] = file
	if _, ok := current["split"]; !ok {
		current["split"] = "9"
	}
	data, err := json.MarshalIndent(current, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	if err := os.WriteFile(path, append(data, '\n'), 0o600); err != nil {
		return err
	}
	fmt.Fprintf(out, "Uloženo do %s.\n", path)
	return nil
}
