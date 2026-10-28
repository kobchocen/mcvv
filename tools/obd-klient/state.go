package main

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"strconv"
)

// State si pamatuje, co už server potvrdil, aby se po restartu klienta neposílalo všechno znovu.
// I kdyby se stav ztratil, nic se nerozbije: server stejné hodnoty vrátí jako „unchanged“.
//
//   - Acked: klíč `split:číslo:čas` → výsledek ze serveru (konflikty a odmítnutí se neposílají znovu);
//   - Sent: `split:číslo` → čas, který na webu drží OBD (podle něj se pozná oprava a smazání);
//   - Missing: `split:číslo` → v kolika po sobě jdoucích verzích souboru řádek chybí.
//   - Epoch: epocha dat na serveru (testovací běh + nula, #186). Když se změní, stav se zahodí.
type State struct {
	path    string
	Epoch   string            `json:"epoch,omitempty"`
	Acked   map[string]string `json:"acked"`
	Sent    map[string]int    `json:"sent"`
	Missing map[string]int    `json:"missing"`
}

func newState(path string) *State {
	return &State{path: path, Acked: map[string]string{}, Sent: map[string]int{}, Missing: map[string]int{}}
}

func LoadState(path string) (*State, error) {
	state := newState(path)
	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return state, nil
	}
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal(data, state); err != nil {
		// poškozený stav (např. výpadek proudu při zápisu) – začne se znovu, server deduplikuje
		return newState(path), nil
	}
	if state.Acked == nil {
		state.Acked = map[string]string{}
	}
	if state.Sent == nil {
		state.Sent = map[string]int{}
	}
	if state.Missing == nil {
		state.Missing = map[string]int{}
	}
	return state, nil
}

// Save zapisuje atomicky (tmp + rename), aby výpadek proudu nenechal rozbitý soubor.
// encoding/json řadí klíče map sám, takže soubor je stabilní.
func (s *State) Save() error {
	data, err := json.MarshalIndent(struct {
		Epoch   string            `json:"epoch,omitempty"`
		Acked   map[string]string `json:"acked"`
		Sent    map[string]int    `json:"sent"`
		Missing map[string]int    `json:"missing,omitempty"`
	}{s.Epoch, s.Acked, s.Sent, s.Missing}, "", "  ")
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

// SyncEpoch porovná epochu dat ze serveru (#186, Q72). Nový testovací běh nebo nová nula
// znamená, že server testovací data uklidil: potvrzené řádky už neplatí, stav se zahodí a soubor
// se pošle znovu (server je idempotentní). Prázdná epocha (starší server) nic nemění.
// Vrací true, když se stav vynuloval.
func (s *State) SyncEpoch(epoch string) bool {
	if epoch == "" || epoch == s.Epoch {
		return false
	}
	// stav bez epochy (starší verze klienta) se zahodí jen tehdy, když v něm něco je
	hadData := len(s.Acked) > 0 || len(s.Sent) > 0 || len(s.Missing) > 0
	s.Acked = map[string]string{}
	s.Sent = map[string]int{}
	s.Missing = map[string]int{}
	s.Epoch = epoch
	return hadData
}

func bibKey(split string, bib int) string { return split + ":" + strconv.Itoa(bib) }

// Pending vrátí řádky ze souboru, které je potřeba poslat: nové nebo s jiným časem, než jaký
// na webu drží OBD. Hodnoty, které server už jednou rozhodl (konflikt, odmítnutí), se neopakují.
func (s *State) Pending(split string, punches []Punch) []Punch {
	var out []Punch
	for _, punch := range punches {
		if held, ok := s.Sent[bibKey(split, punch.Bib)]; ok && held == punch.TimeS {
			continue
		}
		if _, done := s.Acked[punch.Key(split)]; done {
			if _, held := s.Sent[bibKey(split, punch.Bib)]; !held {
				continue
			}
		}
		out = append(out, punch)
	}
	return out
}

// Vanished vrátí čísla, která web drží od OBD, ale v souboru chybí, seřazená podle čísla.
func (s *State) Vanished(split string, punches []Punch) []Punch {
	present := map[int]bool{}
	for _, punch := range punches {
		present[punch.Bib] = true
	}
	var out []Punch
	prefix := split + ":"
	for key, timeS := range s.Sent {
		if len(key) <= len(prefix) || key[:len(prefix)] != prefix {
			continue
		}
		bib, err := strconv.Atoi(key[len(prefix):])
		if err != nil || present[bib] {
			continue
		}
		out = append(out, Punch{Bib: bib, TimeS: timeS})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Bib < out[j].Bib })
	return out
}

// Record zapíše výsledek ze serveru do stavu.
func (s *State) Record(split string, change Change, outcome string) {
	key := bibKey(split, change.Bib)
	delete(s.Missing, key)
	if change.Delete {
		// smazáno na webu: když se stejný čas v OBD znovu objeví, pošle se znovu
		delete(s.Sent, key)
		delete(s.Acked, change.Key(split))
		return
	}
	s.Acked[change.Key(split)] = outcome
	switch outcome {
	case "applied", "unchanged", "resolved":
		s.Sent[key] = change.TimeS
	default:
		// konflikt / odmítnutí: web drží jinou hodnotu (nebo žádnou) – OBD ji nevlastní
		delete(s.Sent, key)
	}
}
