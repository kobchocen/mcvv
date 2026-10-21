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
	HTTP    *http.Client
}

type uploadItem struct {
	Action string `json:"action,omitempty"` // "set" (výchozí) nebo "delete" (řádek zmizel ze souboru)
	Bib    int    `json:"bib"`
	Split  string `json:"split"`
	TimeS  int    `json:"timeS"`
	SeenAt string `json:"seenAt,omitempty"`
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
	Results []ItemResult   `json:"results"`
	Summary map[string]int `json:"summary"`
	Error   string         `json:"error"`
	Reason  string         `json:"reason"`
}

// APIError nese HTTP status, aby smyčka věděla, jestli má smysl opakovat.
type APIError struct {
	Status int
	Body   string
}

func (e *APIError) Error() string { return fmt.Sprintf("HTTP %d: %s", e.Status, e.Body) }

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
		return nil, &APIError{Status: res.StatusCode, Body: strings.TrimSpace(string(data))}
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

// Upload pošle dávku (max 200) a vrátí výsledky po položkách.
func (c *Client) Upload(ctx context.Context, changes []Change, seenAt time.Time) ([]ItemResult, error) {
	items := make([]uploadItem, 0, len(changes))
	for _, change := range changes {
		items = append(items, uploadItem{Action: change.action(), Bib: change.Bib, Split: c.Split, TimeS: change.TimeS, SeenAt: seenAt.UTC().Format(time.RFC3339)})
	}
	body, _ := json.Marshal(map[string]any{"items": items, "client": "obd-klient/" + c.Version})
	data, err := c.do(ctx, http.MethodPost, body)
	if err != nil {
		return nil, err
	}
	var response uploadResponse
	if err := json.Unmarshal(data, &response); err != nil {
		return nil, fmt.Errorf("neplatná odpověď serveru: %w", err)
	}
	if len(response.Results) != len(changes) {
		return nil, fmt.Errorf("server vrátil %d výsledků místo %d", len(response.Results), len(changes))
	}
	return response.Results, nil
}
