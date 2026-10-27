package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const maxBatch = 200

type Client struct {
	BaseURL string
	Token   string
	Year    int
	Split   string
	Version string
	Replace bool // applyCorrections: požádat server o přepsání času z OBD
	HTTP    *http.Client
}

type uploadItem struct {
	Action  string `json:"action,omitempty"`  // "set" (výchozí) nebo "delete" (řádek zmizel ze souboru)
	Replace bool   `json:"replace,omitempty"` // jen s applyCorrections
	Bib     int    `json:"bib"`
	Split   string `json:"split"`
	TimeS   int    `json:"timeS"`
	SeenAt  string `json:"seenAt,omitempty"`
}

type ItemResult struct {
	ID           string `json:"id"`
	Outcome      string `json:"outcome"`
	Bib          int    `json:"bib"`
	Time         *int   `json:"time"`
	Note         string `json:"note"`
	ExistingTime *int   `json:"existingTime"`
}

type uploadResponse struct {
	OK      bool           `json:"ok"`
	Epoch   string         `json:"epoch"`
	Results []ItemResult   `json:"results"`
	Summary map[string]int `json:"summary"`
	Error   string         `json:"error"`
	Reason  string         `json:"reason"`
}

// newHTTPClient: klient, který nenásleduje přesměrování. Go při přesměrování na jiný host
// zahodí hlavičku Authorization a z POST (301/302) udělá GET – časy by se tiše neodeslaly.
// Odpověď 3xx proto vrátíme tak, jak je, a do() z ní udělá chybu konfigurace s cílovou adresou.
func newHTTPClient(timeout time.Duration) *http.Client {
	return &http.Client{
		Timeout: timeout,
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
}

// APIError nese HTTP status, aby smyčka věděla, jestli má smysl opakovat.
type APIError struct {
	Status   int
	Body     string
	Location string // cíl přesměrování (jen u 3xx)
}

func (e *APIError) Error() string {
	if e.Redirect() {
		target := e.Location
		if target == "" {
			target = "(neuvedeno)"
		}
		return fmt.Sprintf("HTTP %d: server přesměrovává na %s – v nastavení je špatná adresa webu (url), opravte ji přes obd-klient.exe -setup (správně https://mcvv.org)", e.Status, target)
	}
	return fmt.Sprintf("HTTP %d: %s", e.Status, e.Body)
}

// Redirect: server odpověděl přesměrováním (3xx) – chyba konfigurace, ne výpadek.
func (e *APIError) Redirect() bool { return e.Status >= 300 && e.Status < 400 }

// Retryable: síť, 5xx a 429 se opakují s backoffem; 4xx (špatný token, rok, úsek) ne – chce zásah člověka.
func (e *APIError) Retryable() bool { return e.Status >= 500 || e.Status == 429 || e.Status == 408 }

func (c *Client) endpoint() string {
	return fmt.Sprintf("%s/api/race/%d/splits", strings.TrimRight(c.BaseURL, "/"), c.Year)
}

func (c *Client) do(ctx context.Context, method string, body []byte) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, method, c.endpoint(), bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+c.Token)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "mcvv-obd-klient/"+c.Version)
	res, err := c.HTTP.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	data, _ := io.ReadAll(io.LimitReader(res.Body, 1<<20))
	if res.StatusCode >= 300 {
		apiErr := &APIError{Status: res.StatusCode, Body: strings.TrimSpace(string(data))}
		if apiErr.Redirect() {
			if location, err := res.Location(); err == nil {
				apiErr.Location = location.String()
			} else {
				apiErr.Location = res.Header.Get("Location")
			}
		}
		return nil, apiErr
	}
	return data, nil
}

// Ping ověří token (GET vrátí rok, název zařízení a povolené úseky).
func (c *Client) Ping(ctx context.Context) (string, error) {
	data, err := c.do(ctx, http.MethodGet, nil)
	if err != nil {
		return "", err
	}
	return string(data), nil
}

// ServerInfo: odpověď GET – epocha dat (#186) a příznak testovacího běhu.
type ServerInfo struct {
	Epoch string `json:"epoch"`
	Test  bool   `json:"test"`
}

// Info zjistí epochu dat na serveru (GET). Starší server epochu neposílá → prázdná.
func (c *Client) Info(ctx context.Context) (ServerInfo, error) {
	var info ServerInfo
	data, err := c.do(ctx, http.MethodGet, nil)
	if err != nil {
		return info, err
	}
	if err := json.Unmarshal(data, &info); err != nil {
		return info, fmt.Errorf("neplatná odpověď serveru: %w", err)
	}
	return info, nil
}

// Change je jedna položka k odeslání: nový/opravený čas (set) nebo zmizelý řádek (delete).
type Change struct {
	Punch
	Delete bool
}

func (c Change) action() string {
	if c.Delete {
		return "delete"
	}
	return "set"
}

// Upload pošle dávku (max 200) a vrátí výsledky po položkách a epochu dat serveru.
func (c *Client) Upload(ctx context.Context, changes []Change, seenAt time.Time) ([]ItemResult, string, error) {
	items := make([]uploadItem, 0, len(changes))
	for _, change := range changes {
		items = append(items, uploadItem{Action: change.action(), Replace: c.Replace && !change.Delete, Bib: change.Bib, Split: c.Split, TimeS: change.TimeS, SeenAt: seenAt.UTC().Format(time.RFC3339)})
	}
	body, _ := json.Marshal(map[string]any{"items": items, "client": "obd-klient/" + c.Version})
	data, err := c.do(ctx, http.MethodPost, body)
	if err != nil {
		return nil, "", err
	}
	var response uploadResponse
	if err := json.Unmarshal(data, &response); err != nil {
		return nil, "", fmt.Errorf("neplatná odpověď serveru: %w", err)
	}
	if len(response.Results) != len(changes) {
		return nil, "", fmt.Errorf("server vrátil %d výsledků místo %d", len(response.Results), len(changes))
	}
	return response.Results, response.Epoch, nil
}
