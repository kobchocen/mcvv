package main

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sort"
)

// State si pamatuje, co už server potvrdil, aby se po restartu klienta neposílalo všechno znovu.
// I kdyby se stav ztratil, nic se nerozbije: server stejné hodnoty vrátí jako „unchanged“.
type State struct {
	path  string
	Acked map[string]string `json:"acked"` // klíč -> outcome ze serveru
}

func LoadState(path string) (*State, error) {
	state := &State{path: path, Acked: map[string]string{}}
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return state, nil
	}
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal(data, state); err != nil {
		// poškozený stav (např. výpadek proudu při zápisu) – začne se znovu, server deduplikuje
		return &State{path: path, Acked: map[string]string{}}, nil
	}
	if state.Acked == nil {
		state.Acked = map[string]string{}
	}
	return state, nil
}

// Save zapisuje atomicky (tmp + rename), aby výpadek proudu nenechal rozbitý soubor.
func (s *State) Save() error {
	keys := make([]string, 0, len(s.Acked))
	for key := range s.Acked {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	ordered := make(map[string]string, len(keys))
	for _, key := range keys {
		ordered[key] = s.Acked[key]
	}
	data, err := json.MarshalIndent(struct {
		Acked map[string]string `json:"acked"`
	}{ordered}, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(s.path), 0o755); err != nil {
		return err
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, s.path)
}

// Pending vrátí řádky, které server ještě nepotvrdil.
func (s *State) Pending(split string, punches []Punch) []Punch {
	var out []Punch
	for _, punch := range punches {
		if _, done := s.Acked[punch.Key(split)]; !done {
			out = append(out, punch)
		}
	}
	return out
}
