// obd-klient: hlídá export mezičasů/cílových časů z OBD a posílá je do webu MČVV.
// Jeden soubor .exe, bez instalace. Viz README.md.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"math/rand"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"time"
)

var version = "dev"

type Config struct {
	URL          string `json:"url"`          // https://www.mcvv.org
	Token        string `json:"token"`        // mcvv_live_… z /admin/den-zavodu/zive (zobrazí se jen jednou)
	Year         int    `json:"year"`         // ročník, např. 2026
	File         string `json:"file"`         // cesta k exportu OBD, např. C:\OBD\tmp\splits.csv
	Split        string `json:"split"`        // "9" = cíl (výchozí), "1"/"3" mezičasy
	IntervalS    int    `json:"intervalS"`    // jak často kontrolovat soubor (s), výchozí 5
	StateFile    string `json:"stateFile"`    // kam ukládat potvrzené řádky, výchozí vedle configu
	MaxBackoffS  int    `json:"maxBackoffS"`  // strop pro opakování při výpadku, výchozí 60
	InsecureHTTP bool   `json:"insecureHttp"` // povolit http:// (jen pro lokální test)
}

func loadConfig(path string) (Config, error) {
	cfg := Config{Split: "9", IntervalS: 5, MaxBackoffS: 60}
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
	return cfg, cfg.validate()
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
	showVersion := flag.Bool("version", false, "vypíše verzi")
	flag.Parse()
	if *showVersion {
		fmt.Println(version)
		return
	}
	if !filepath.IsAbs(*configPath) {
		if exe, err := os.Executable(); err == nil {
			if _, statErr := os.Stat(*configPath); statErr != nil {
				*configPath = filepath.Join(filepath.Dir(exe), *configPath)
			}
		}
	}
	cfg, err := loadConfig(*configPath)
	if err != nil {
		fatal("Konfigurace: %v", err)
	}
	client := &Client{BaseURL: cfg.URL, Token: cfg.Token, Year: cfg.Year, Split: cfg.Split, Version: version, HTTP: &http.Client{Timeout: 15 * time.Second}}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()

	logf("obd-klient %s · %s · rok %d · úsek %s · soubor %s", version, cfg.URL, cfg.Year, cfg.Split, cfg.File)
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
	cfg       Config
	client    *Client
	state     *State
	now       func() time.Time
	failures  int
	lastStamp string
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

// Tick = jeden průchod. Vrací chybu jen pro věci, které se mají opakovat.
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
	pending := r.state.Pending(r.cfg.Split, parsed.Punches)
	if stamp != r.lastStamp {
		logf("Soubor: %d řádků, %d přeskočeno, %d k odeslání", len(parsed.Punches), parsed.Skipped, len(pending))
	}
	r.lastStamp = stamp
	seenAt := r.now()
	for start := 0; start < len(pending); start += maxBatch {
		end := min(start+maxBatch, len(pending))
		batch := pending[start:end]
		results, err := r.client.Upload(ctx, batch, seenAt)
		if err != nil {
			var apiErr *APIError
			if errors.As(err, &apiErr) && !apiErr.Retryable() {
				return fmt.Errorf("server odmítl dávku (zkontrolujte token/rok/úsek): %w", err)
			}
			return err
		}
		counts := map[string]int{}
		for i, result := range results {
			r.state.Acked[batch[i].Key(r.cfg.Split)] = result.Outcome
			counts[result.Outcome]++
			if result.Outcome == "conflict" {
				logf("KONFLIKT č. %d: posláno %s, na webu je jiný čas (%s) – rozhodne admin v /admin/den-zavodu/zive", batch[i].Bib, fmtTime(batch[i].TimeS), result.Note)
			}
			if result.Outcome == "rejected" {
				logf("ODMÍTNUTO č. %d (%s): %s", batch[i].Bib, fmtTime(batch[i].TimeS), result.Note)
			}
		}
		if err := r.state.Save(); err != nil {
			return fmt.Errorf("uložení stavu: %w", err)
		}
		logf("Odesláno %d: %v", len(batch), counts)
	}
	return nil
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
	os.Exit(1)
}
