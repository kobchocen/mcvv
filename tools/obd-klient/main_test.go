package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"sync"
	"testing"
	"time"
)

func TestParseSplitsCSV(t *testing.T) {
	data := []byte("\xEF\xBB\xBFcislo;time_s\r\n41;1686\r\n42;28:06\n\n 643 ; 0:30:00 \nx;1\n44;\n45,1700\n46\t1701\n41;1690\n47;-5\n48;99999\n")
	got := ParseSplitsCSV(data)
	want := []Punch{{41, 1690}, {42, 1686}, {643, 1800}, {45, 1700}, {46, 1701}}
	if len(got.Punches) != len(want) {
		t.Fatalf("punches = %v", got.Punches)
	}
	for i := range want {
		if got.Punches[i] != want[i] {
			t.Errorf("punch %d = %v, want %v", i, got.Punches[i], want[i])
		}
	}
	if got.Skipped != 5 {
		t.Errorf("skipped = %d, want 5", got.Skipped)
	}
}

func TestParseTime(t *testing.T) {
	cases := map[string]int{"1686": 1686, "28:06": 1686, "0:28:06": 1686, "1:00:00": 3600}
	for in, want := range cases {
		if got, ok := parseTime(in); !ok || got != want {
			t.Errorf("parseTime(%q) = %d,%v", in, got, ok)
		}
	}
	for _, bad := range []string{"", "0", "28:60", "a:b", "1:2:3:4", "21601"} {
		if _, ok := parseTime(bad); ok {
			t.Errorf("parseTime(%q) should fail", bad)
		}
	}
}

func TestStateRoundTripAndCorrupt(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "sub", "state.json")
	state, err := LoadState(path)
	if err != nil {
		t.Fatal(err)
	}
	state.Acked["9:41:1686"] = "applied"
	if err := state.Save(); err != nil {
		t.Fatal(err)
	}
	again, _ := LoadState(path)
	if again.Acked["9:41:1686"] != "applied" {
		t.Fatalf("state not persisted: %v", again.Acked)
	}
	pending := again.Pending("9", []Punch{{41, 1686}, {41, 1690}, {42, 1700}})
	if len(pending) != 2 {
		t.Fatalf("pending = %v", pending)
	}
	_ = os.WriteFile(path, []byte("{broken"), 0o600)
	broken, err := LoadState(path)
	if err != nil || len(broken.Acked) != 0 {
		t.Fatalf("corrupt state should reset, got %v %v", broken, err)
	}
}

// fakeServer napodobuje /api/race/{rok}/splits: idempotence přes klíč, výpadek přes failNext.
type fakeServer struct {
	mu       sync.Mutex
	seen     map[string]int
	failNext int
	status   int
	calls    int
	auth     string
}

func (f *fakeServer) handler(w http.ResponseWriter, r *http.Request) {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.calls++
	f.auth = r.Header.Get("Authorization")
	if r.URL.Path != "/api/race/2026/splits" {
		http.Error(w, "nope", http.StatusNotFound)
		return
	}
	if f.failNext > 0 {
		f.failNext--
		http.Error(w, "down", f.status)
		return
	}
	if r.Method == http.MethodGet {
		_, _ = w.Write([]byte(`{"ok":true}`))
		return
	}
	var body struct {
		Items []uploadItem `json:"items"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body)
	results := []map[string]any{}
	for _, item := range body.Items {
		key := Punch{item.Bib, item.TimeS}.Key(item.Split)
		outcome := "applied"
		if f.seen[key] > 0 {
			outcome = "unchanged"
		}
		f.seen[key]++
		results = append(results, map[string]any{"id": key, "outcome": outcome, "bib": item.Bib})
	}
	_ = json.NewEncoder(w).Encode(map[string]any{"ok": true, "results": results})
}

func newRunner(t *testing.T, url, file string) *Runner {
	t.Helper()
	cfg := Config{URL: url, Token: "mcvv_live_test", Year: 2026, File: file, Split: "9", IntervalS: 1, StateFile: filepath.Join(t.TempDir(), "state.json"), MaxBackoffS: 1, InsecureHTTP: true}
	state, err := LoadState(cfg.StateFile)
	if err != nil {
		t.Fatal(err)
	}
	return &Runner{cfg: cfg, state: state, now: time.Now, client: &Client{BaseURL: url, Token: cfg.Token, Year: 2026, Split: "9", Version: "test", HTTP: &http.Client{Timeout: 2 * time.Second}}}
}

func TestRunnerSurvivesOutageWithoutDuplicates(t *testing.T) {
	fake := &fakeServer{seen: map[string]int{}, status: http.StatusBadGateway}
	server := httptest.NewServer(http.HandlerFunc(fake.handler))
	defer server.Close()
	file := filepath.Join(t.TempDir(), "splits.csv")
	_ = os.WriteFile(file, []byte("41;1686\n42;1700\n"), 0o644)
	runner := newRunner(t, server.URL, file)
	ctx := context.Background()

	if err := runner.Tick(ctx); err != nil {
		t.Fatal(err)
	}
	// výpadek: OBD mezitím přidá řádky
	_ = os.WriteFile(file, []byte("41;1686\n42;1700\n43;1710\n44;1720\n"), 0o644)
	fake.failNext, fake.status = 3, http.StatusBadGateway
	for i := 0; i < 3; i++ {
		if err := runner.Tick(ctx); err == nil {
			t.Fatal("expected error during outage")
		}
	}
	if err := runner.Tick(ctx); err != nil {
		t.Fatal(err)
	}
	// opakovaný průchod nic neposílá
	before := fake.calls
	if err := runner.Tick(ctx); err != nil {
		t.Fatal(err)
	}
	if fake.calls != before {
		t.Errorf("nothing should be sent when all rows are acked")
	}
	for key, n := range fake.seen {
		if n != 1 {
			t.Errorf("%s sent %d times", key, n)
		}
	}
	if len(fake.seen) != 4 {
		t.Errorf("server saw %d rows, want 4", len(fake.seen))
	}
	if fake.auth != "Bearer mcvv_live_test" {
		t.Errorf("auth header = %q", fake.auth)
	}
	// ztracený stav → znovu odeslání je bezpečné (server vrátí unchanged)
	runner.state.Acked = map[string]string{}
	if err := runner.Tick(ctx); err != nil {
		t.Fatal(err)
	}
	if runner.state.Acked["9:43:1710"] != "unchanged" {
		t.Errorf("resend outcome = %q", runner.state.Acked["9:43:1710"])
	}
}

func TestRunnerStopsOnAuthError(t *testing.T) {
	fake := &fakeServer{seen: map[string]int{}, failNext: 1, status: http.StatusUnauthorized}
	server := httptest.NewServer(http.HandlerFunc(fake.handler))
	defer server.Close()
	file := filepath.Join(t.TempDir(), "splits.csv")
	_ = os.WriteFile(file, []byte("41;1686\n"), 0o644)
	runner := newRunner(t, server.URL, file)
	err := runner.Tick(context.Background())
	if err == nil || len(runner.state.Acked) != 0 {
		t.Fatalf("expected non-retryable error, got %v", err)
	}
}

func TestBatching(t *testing.T) {
	fake := &fakeServer{seen: map[string]int{}}
	server := httptest.NewServer(http.HandlerFunc(fake.handler))
	defer server.Close()
	file := filepath.Join(t.TempDir(), "splits.csv")
	content := []byte{}
	for bib := 1; bib <= 450; bib++ {
		content = append(content, []byte(strconv.Itoa(bib)+";"+strconv.Itoa(1000+bib)+"\n")...)
	}
	_ = os.WriteFile(file, content, 0o644)
	runner := newRunner(t, server.URL, file)
	if err := runner.Tick(context.Background()); err != nil {
		t.Fatal(err)
	}
	if fake.calls != 3 || len(fake.seen) != 450 {
		t.Errorf("calls=%d seen=%d", fake.calls, len(fake.seen))
	}
}

func TestConfigValidation(t *testing.T) {
	if err := (Config{URL: "http://x", Token: "abc", Year: 1, Split: "9", IntervalS: 1}).validate(); err == nil {
		t.Fatal("expected validation errors")
	}
	ok := Config{URL: "https://www.mcvv.org", Token: "mcvv_live_x", Year: 2026, File: "a.csv", Split: "9", IntervalS: 5}
	if err := ok.validate(); err != nil {
		t.Fatal(err)
	}
}
