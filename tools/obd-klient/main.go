// obd-klient: hlídá export mezičasů/cílových časů z OBD a posílá je do webu MČVV.
// Jeden soubor .exe, bez instalace. Viz README.md.
package main

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"math/rand"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"time"
)

// Nastaví build: -ldflags "-X main.version=0.1.1 -X main.commit=abc1234".
var (
	version = "dev"
	commit  = ""
)

// versionString: „0.1.0 (abc1234)“, bez commitu jen verze.
func versionString() string {
	if commit == "" {
		return version
	}
	return version + " (" + commit + ")"
}

type Config struct {
	URL          string `json:"url"`          // https://mcvv.org
	Token        string `json:"token"`        // mcvv_live_… z /admin/den-zavodu/zive (zobrazí se jen jednou)
	Year         int    `json:"year"`         // ročník, např. 2026
	File         string `json:"file"`         // cesta k exportu OBD, např. C:\OBD\tmp\splits.csv
	Split        string `json:"split"`        // "9" = cíl (výchozí), "1"/"3" mezičasy
	IntervalS    int    `json:"intervalS"`    // jak často kontrolovat soubor (s), výchozí 5
	StateFile    string `json:"stateFile"`    // kam ukládat potvrzené řádky, výchozí vedle configu
	MaxBackoffS  int    `json:"maxBackoffS"`  // strop pro opakování při výpadku, výchozí 60
	InsecureHTTP bool   `json:"insecureHttp"` // povolit http:// (jen pro lokální test)
	// Výchozí 1:1 s legacy (Q22): platí první zapsaný čas, opravy ani smazání z OBD se nepropisují.
	// ApplyCorrections: změněný čas v OBD přepíše čas, který dřív poslalo OBD. Výchozí false
	// (změna se na webu ukáže jako konflikt pro admina).
	ApplyCorrections bool `json:"applyCorrections,omitempty"`
	// DeleteMissing: řádek, který zmizí ze souboru (OBD čas smazalo), smazat i na webu. Výchozí false.
	DeleteMissing bool `json:"deleteMissing,omitempty"`
	// MissingSnapshots: v kolika po sobě jdoucích verzích souboru musí řádek chybět, než se smaže
	// (ochrana proti rozepsanému souboru). Výchozí 2 (OBD přepisuje soubor každých 60 s).
	MissingSnapshots int `json:"missingSnapshots,omitempty"`
}

func (c Config) deleteMissing() bool { return c.DeleteMissing }

func (c Config) missingSnapshots() int {
	if c.MissingSnapshots < 1 {
		return 2
	}
	return c.MissingSnapshots
}

func loadConfig(path string) (Config, error) {
	cfg, err := readConfig(path)
	if err != nil {
		return cfg, err
	}
	return cfg, cfg.validate()
}

func readConfig(path string) (Config, error) {
	cfg := Config{Split: "9", IntervalS: 5, MaxBackoffS: 60, MissingSnapshots: 2}
	data, err := os.ReadFile(path)
	if err != nil {
		return cfg, err
	}
	if err := json.Unmarshal(data, &cfg); err != nil {
		return cfg, fmt.Errorf("config %s: %w", path, err)
	}
	if env := os.Getenv("MCVV_TOKEN"); env != "" {
		cfg.Token = env
	}
	if cfg.StateFile == "" {
		cfg.StateFile = filepath.Join(filepath.Dir(path), "state.json")
	}
	return cfg, nil
}

func (c Config) validate() error {
	var problems []string
	if c.URL == "" {
		problems = append(problems, "chybí url")
	} else if !strings.HasPrefix(c.URL, "https://") && !c.InsecureHTTP {
		problems = append(problems, "url musí začínat https://")
	}
	if !strings.HasPrefix(c.Token, "mcvv_live_") {
		problems = append(problems, "chybí nebo neplatný token (mcvv_live_…)")
	}
	if c.Year < 2000 || c.Year > 2100 {
		problems = append(problems, "neplatný rok")
	}
	if c.File == "" {
		problems = append(problems, "chybí file (cesta k exportu OBD)")
	}
	if c.Split == "" {
		problems = append(problems, "chybí split")
	}
	if c.IntervalS < 1 {
		problems = append(problems, "intervalS musí být ≥ 1")
	}

	if len(problems) > 0 {
		return errors.New(strings.Join(problems, "; "))
	}
	return nil
}

func main() {
	configPath := flag.String("config", "config.json", "cesta ke konfiguraci")
	once := flag.Bool("once", false, "jeden průchod a konec (test)")
	check := flag.Bool("check", false, "jen ověří token a spojení")
	setup := flag.Bool("setup", false, "znovu se zeptá na nastavení (URL, token, rok, cesta k souboru) a uloží config")
	fileFlag := flag.String("file", "", "cesta k souboru s mezičasy z OBD (přepíše file z configu)")
	showVersion := flag.Bool("version", false, "vypíše verzi")
	flag.Parse()
	if *showVersion {
		fmt.Println("obd-klient " + versionString())
		return
	}
	if !filepath.IsAbs(*configPath) {
		if exe, err := os.Executable(); err == nil {
			if _, statErr := os.Stat(*configPath); statErr != nil {
				*configPath = filepath.Join(filepath.Dir(exe), *configPath)
			}
		}
	}
	if _, statErr := os.Stat(*configPath); *setup || errors.Is(statErr, os.ErrNotExist) {
		if !interactive() {
			fatal("Konfigurace %s neexistuje. Spusťte obd-klient.exe v okně příkazového řádku – zeptá se na nastavení – nebo vytvořte config.json podle config.example.json.", *configPath)
		}
		if err := runSetup(*configPath, os.Stdin, os.Stdout, *fileFlag); err != nil {
			fatal("Nastavení: %v", err)
		}
	}
	cfg, err := loadConfigWithFile(*configPath, *fileFlag)
	if err != nil {
		fatal("Konfigurace: %v", err)
	}
	client := &Client{BaseURL: cfg.URL, Token: cfg.Token, Year: cfg.Year, Split: cfg.Split, Version: version, Replace: cfg.ApplyCorrections, HTTP: newHTTPClient(15 * time.Second)}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()

	logf("obd-klient %s · %s · rok %d · úsek %s · soubor %s · opravy %s · mazání %s", versionString(), cfg.URL, cfg.Year, cfg.Split, cfg.File, onOff(cfg.ApplyCorrections), onOff(cfg.DeleteMissing))
	if info, err := client.Ping(ctx); err != nil {
		logf("Ověření tokenu selhalo: %v", err)
		if *check {
			os.Exit(1)
		}
	} else {
		logf("Spojení OK: %s", info)
		if *check {
			return
		}
	}
	state, err := LoadState(cfg.StateFile)
	if err != nil {
		fatal("Stav %s: %v", cfg.StateFile, err)
	}
	runner := &Runner{cfg: cfg, client: client, state: state, now: time.Now}
	if *once {
		if err := runner.Tick(ctx); err != nil {
			fatal("%v", err)
		}
		return
	}
	runner.Loop(ctx)
	logf("Ukončeno.")
}

// Runner drží smyčku: přečti soubor → pošli nepotvrzené → při chybě backoff.
type Runner struct {
	cfg         Config
	client      *Client
	state       *State
	now         func() time.Time
	failures    int
	lastStamp   string
	lastEpochAt time.Time // kdy se naposledy ověřovala epocha dat na serveru
}

// epochCheckEvery: jak často se ptát serveru na epochu dat i bez nové verze souboru.
const epochCheckEvery = 30 * time.Second

// checkEpoch se zeptá serveru na epochu dat (nový testovací běh / nová nula, #186) a při
// změně zahodí stav – další průchod pošle celý soubor znovu.
func (r *Runner) checkEpoch(ctx context.Context) error {
	info, err := r.client.Info(ctx)
	if err != nil {
		var apiErr *APIError
		if errors.As(err, &apiErr) && apiErr.Redirect() {
			return fmt.Errorf("chyba konfigurace: %w", err)
		}
		if errors.As(err, &apiErr) && !apiErr.Retryable() {
			return fmt.Errorf("server odmítl dotaz (zkontrolujte token/rok/úsek): %w", err)
		}
		return err
	}
	r.lastEpochAt = r.now()
	return r.applyEpoch(info.Epoch)
}

// applyEpoch uloží novou epochu; když se tím zahodil stav, oznámí to do logu.
func (r *Runner) applyEpoch(epoch string) error {
	if epoch == "" || epoch == r.state.Epoch {
		return nil
	}
	if r.state.SyncEpoch(epoch) {
		logf("NOVÝ TESTOVACÍ BĚH / NOVÁ NULA na webu (%s) – stav klienta vynulován, soubor se pošle znovu.", epoch)
	}
	if err := r.state.Save(); err != nil {
		return fmt.Errorf("uložení stavu: %w", err)
	}
	return nil
}

func (r *Runner) Loop(ctx context.Context) {
	for {
		wait := time.Duration(r.cfg.IntervalS) * time.Second
		if err := r.Tick(ctx); err != nil {
			r.failures++
			wait = backoff(r.failures, time.Duration(r.cfg.MaxBackoffS)*time.Second)
			logf("Chyba: %v – další pokus za %s", err, wait.Round(time.Second))
		} else {
			r.failures = 0
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(wait):
		}
	}
}

func onOff(on bool) string {
	if on {
		return "zapnuté"
	}
	return "vypnuté"
}

// Tick = jeden průchod. Vrací chybu jen pro věci, které se mají opakovat.
//
// OBD každých 60 s přepíše celý soubor (snapshot). Klient posílá nové řádky a jednou i změněný
// čas (výchozí: server ho nepřepíše, admin vidí konflikt – 1:1 s legacy). Se zapnutým
// `applyCorrections` změna přepíše čas z OBD; se zapnutým `deleteMissing` se pošlou i řádky,
// které ze souboru zmizely – až po `missingSnapshots` (výchozí 2) verzích souboru a jen když
// soubor nevypadá useknutě.
func (r *Runner) Tick(ctx context.Context) error {
	info, err := os.Stat(r.cfg.File)
	if err != nil {
		return fmt.Errorf("soubor %s: %w", r.cfg.File, err)
	}
	stamp := fmt.Sprintf("%d:%d", info.Size(), info.ModTime().UnixNano())
	data, err := readStable(r.cfg.File)
	if err != nil {
		return err
	}
	parsed := ParseSplitsCSV(data)
	newSnapshot := stamp != r.lastStamp
	if newSnapshot || r.lastEpochAt.IsZero() || r.now().Sub(r.lastEpochAt) >= epochCheckEvery {
		if err := r.checkEpoch(ctx); err != nil {
			return err
		}
	}
	r.lastStamp = stamp
	split := r.cfg.Split

	var changes []Change
	for _, punch := range r.state.Pending(split, parsed.Punches) {
		changes = append(changes, Change{Punch: punch})
	}
	deletes, stateChanged := r.planDeletes(parsed, newSnapshot)
	changes = append(changes, deletes...)
	if newSnapshot {
		logf("Soubor: %d řádků, %d přeskočeno, %d opakovaných čísel, %d k odeslání (z toho %d smazání)", len(parsed.Punches), parsed.Skipped, parsed.Duplicates, len(changes), len(deletes))
	}
	if stateChanged && len(changes) == 0 {
		if err := r.state.Save(); err != nil {
			return fmt.Errorf("uložení stavu: %w", err)
		}
	}
	seenAt := r.now()
	for start := 0; start < len(changes); start += maxBatch {
		end := min(start+maxBatch, len(changes))
		batch := changes[start:end]
		results, epoch, err := r.client.Upload(ctx, batch, seenAt)
		if err != nil {
			var apiErr *APIError
			if errors.As(err, &apiErr) && apiErr.Redirect() {
				return fmt.Errorf("chyba konfigurace: %w", err)
			}
			if errors.As(err, &apiErr) && !apiErr.Retryable() {
				return fmt.Errorf("server odmítl dávku (zkontrolujte token/rok/úsek): %w", err)
			}
			return err
		}
		if epoch != "" && epoch != r.state.Epoch {
			// mezitím začal nový testovací běh: výsledky dávky patří nové epoše, ale stav se
			// raději zahodí celý a příští průchod pošle soubor znovu (server deduplikuje)
			return r.applyEpoch(epoch)
		}
		counts := map[string]int{}
		for i, result := range results {
			change := batch[i]
			r.state.Record(split, change, result.Outcome)
			counts[change.action()+":"+result.Outcome]++
			if result.Outcome == "conflict" {
				held := "jiný čas"
				if result.ExistingTime != nil {
					held = fmtTime(*result.ExistingTime)
				}
				logf("KONFLIKT č. %d: posláno %s, na webu je %s (platí první čas) – rozhodne admin v /admin/den-zavodu/zive", change.Bib, fmtTime(change.TimeS), held)
			}
			if result.Outcome == "rejected" {
				logf("ODMÍTNUTO č. %d (%s): %s", change.Bib, fmtTime(change.TimeS), result.Note)
			}
			if change.Delete && result.Outcome == "deleted" {
				logf("SMAZÁNO č. %d (%s) – řádek zmizel ze souboru OBD", change.Bib, fmtTime(change.TimeS))
			}
		}
		if err := r.state.Save(); err != nil {
			return fmt.Errorf("uložení stavu: %w", err)
		}
		logf("Odesláno %d: %v", len(batch), counts)
	}
	return nil
}

// planDeletes spočítá, které zmizelé řádky se mají smazat i na webu.
func (r *Runner) planDeletes(parsed ParseResult, newSnapshot bool) ([]Change, bool) {
	split := r.cfg.Split
	vanished := r.state.Vanished(split, parsed.Punches)
	changed := false
	gone := map[string]bool{}
	for _, punch := range vanished {
		key := bibKey(split, punch.Bib)
		gone[key] = true
		if newSnapshot {
			r.state.Missing[key]++
			changed = true
		}
	}
	for key := range r.state.Missing {
		if !gone[key] {
			delete(r.state.Missing, key)
			changed = true
		}
	}
	if !r.cfg.deleteMissing() || len(vanished) == 0 {
		return nil, changed
	}
	var ready []Change
	for _, punch := range vanished {
		if r.state.Missing[bibKey(split, punch.Bib)] >= r.cfg.missingSnapshots() {
			ready = append(ready, Change{Punch: punch, Delete: true})
		}
	}
	if len(ready) == 0 {
		return nil, changed
	}
	// Ochrana: prázdný nebo výrazně kratší soubor (rozepsaný, chyba OBD) nic nemaže.
	limit := max(5, len(r.state.Sent)/5)
	if len(parsed.Punches) == 0 || len(ready) > limit {
		if newSnapshot {
			logf("POZOR: ze souboru zmizelo %d časů (soubor má %d řádků) – nic nemažu. Pokud je to správně, smažte časy v /admin/den-zavodu/zive.", len(ready), len(parsed.Punches))
		}
		return nil, changed
	}
	return ready, changed
}

// readStable přečte soubor dvakrát, dokud se mezi čteními nezmění – OBD může zrovna zapisovat.
func readStable(path string) ([]byte, error) {
	var previous []byte
	for attempt := 0; attempt < 5; attempt++ {
		data, err := os.ReadFile(path)
		if err != nil {
			return nil, err
		}
		if previous != nil && string(previous) == string(data) {
			return data, nil
		}
		previous = data
		time.Sleep(150 * time.Millisecond)
	}
	return previous, nil
}

func backoff(failures int, ceiling time.Duration) time.Duration {
	if ceiling <= 0 {
		ceiling = time.Minute
	}
	base := time.Second << min(failures, 10)
	if base > ceiling {
		base = ceiling
	}
	jitter := 0.75 + rand.Float64()*0.5
	return time.Duration(float64(base) * jitter)
}

func fmtTime(seconds int) string {
	return fmt.Sprintf("%d:%02d", seconds/60, seconds%60)
}

func logf(format string, args ...any) {
	fmt.Printf("%s  %s\n", time.Now().Format("15:04:05"), fmt.Sprintf(format, args...))
}

func fatal(format string, args ...any) {
	logf(format, args...)
	if interactive() {
		// spuštěno dvojklikem: okno by se hned zavřelo a chyba by nešla přečíst
		fmt.Print("Stiskněte Enter pro ukončení…")
		_, _ = bufio.NewReader(os.Stdin).ReadString('\n')
	}
	os.Exit(1)
}
