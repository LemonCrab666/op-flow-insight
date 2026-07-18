package store

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"time"

	"github.com/op-flow-insight/op-flow-insight/internal/model"
)

const CurrentVersion = 1

type Baseline struct {
	HostIP   string    `json:"host_ip"`
	Uploaded uint64    `json:"uploaded"`
	Download uint64    `json:"downloaded"`
	LastSeen time.Time `json:"last_seen"`
}

type State struct {
	Version int                   `json:"version"`
	SavedAt time.Time             `json:"saved_at"`
	Hosts   map[string]model.Host `json:"hosts"`
	Active  map[string]Baseline   `json:"active"`
	History []model.RatePoint     `json:"history,omitempty"`
}

func Empty() State {
	return State{
		Version: CurrentVersion,
		Hosts:   make(map[string]model.Host),
		Active:  make(map[string]Baseline),
	}
}

func Load(path string) (State, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return Empty(), nil
		}
		return Empty(), err
	}
	var state State
	if err := json.Unmarshal(raw, &state); err != nil {
		return Empty(), err
	}
	if state.Version != CurrentVersion {
		return Empty(), errors.New("unsupported state version")
	}
	if state.Hosts == nil {
		state.Hosts = make(map[string]model.Host)
	}
	if state.Active == nil {
		state.Active = make(map[string]Baseline)
	}
	return state, nil
}

func Save(path string, state State) error {
	state.Version = CurrentVersion
	state.SavedAt = time.Now().UTC()
	raw, err := json.Marshal(state)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), "."+filepath.Base(path)+".tmp-*")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath)
	if _, err := tmp.Write(raw); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Chmod(0o600); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Rename(tmpPath, path); err == nil {
		return nil
	}
	if err := os.Remove(path); err != nil && !os.IsNotExist(err) {
		return err
	}
	return os.Rename(tmpPath, path)
}
