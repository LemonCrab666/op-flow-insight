package dataset

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type SourceResult struct {
	Name       string `json:"name"`
	File       string `json:"file"`
	Changed    bool   `json:"changed"`
	Bytes      int64  `json:"bytes"`
	SHA256     string `json:"sha256,omitempty"`
	Status     string `json:"status"`
	Error      string `json:"error,omitempty"`
	FinishedAt string `json:"finished_at"`
}

type UpdateResult struct {
	StartedAt  string         `json:"started_at"`
	FinishedAt string         `json:"finished_at"`
	Sources    []SourceResult `json:"sources"`
}

type updateMeta struct {
	ETags        map[string]string `json:"etags"`
	LastModified map[string]string `json:"last_modified"`
}

func Update(ctx context.Context, dir string) (UpdateResult, error) {
	start := time.Now().UTC()
	result := UpdateResult{StartedAt: start.Format(time.RFC3339)}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return result, err
	}
	metaPath := filepath.Join(dir, "update-meta.json")
	meta := readMeta(metaPath)
	client := &http.Client{Timeout: 5 * time.Minute}
	failures := 0
	for _, spec := range allSpecs() {
		item := downloadOne(ctx, client, dir, spec, &meta)
		result.Sources = append(result.Sources, item)
		if item.Error != "" {
			failures++
		}
	}
	result.FinishedAt = time.Now().UTC().Format(time.RFC3339)
	if raw, err := json.MarshalIndent(meta, "", "  "); err == nil {
		_ = writeAtomic(metaPath, raw, 0o644)
	}
	if raw, err := json.MarshalIndent(result, "", "  "); err == nil {
		_ = writeAtomic(filepath.Join(dir, "last-update.json"), raw, 0o644)
	}
	if failures > 0 {
		return result, fmt.Errorf("%d of %d dataset downloads failed", failures, len(result.Sources))
	}
	return result, nil
}

func downloadOne(ctx context.Context, client *http.Client, dir string, spec sourceSpec, meta *updateMeta) SourceResult {
	result := SourceResult{Name: spec.Name, File: spec.File}
	finish := func() SourceResult {
		result.FinishedAt = time.Now().UTC().Format(time.RFC3339)
		return result
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, spec.URL, nil)
	if err != nil {
		result.Error = err.Error()
		return finish()
	}
	req.Header.Set("User-Agent", "op-flow-insight/0.1 (+https://github.com/op-flow-insight)")
	req.Header.Set("Accept", "text/plain, application/octet-stream;q=0.9, */*;q=0.1")
	if etag := meta.ETags[spec.Name]; etag != "" {
		req.Header.Set("If-None-Match", etag)
	}
	if modified := meta.LastModified[spec.Name]; modified != "" {
		req.Header.Set("If-Modified-Since", modified)
	}
	resp, err := client.Do(req)
	if err != nil {
		result.Error = err.Error()
		return finish()
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotModified {
		result.Status = "not_modified"
		now := time.Now()
		_ = os.Chtimes(filepath.Join(dir, spec.File), now, now)
		return finish()
	}
	if resp.StatusCode != http.StatusOK {
		result.Error = "HTTP " + resp.Status
		return finish()
	}
	tmp, err := os.CreateTemp(dir, "."+spec.File+".download-*")
	if err != nil {
		result.Error = err.Error()
		return finish()
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath)
	hash := sha256.New()
	limited := io.LimitReader(resp.Body, spec.MaxBytes+1)
	n, copyErr := io.Copy(io.MultiWriter(tmp, hash), limited)
	closeErr := tmp.Close()
	if copyErr != nil {
		result.Error = copyErr.Error()
		return finish()
	}
	if closeErr != nil {
		result.Error = closeErr.Error()
		return finish()
	}
	if n == 0 || n > spec.MaxBytes {
		result.Error = fmt.Sprintf("invalid download size %d (limit %d)", n, spec.MaxBytes)
		return finish()
	}
	if err := validateDownloaded(tmpPath, spec); err != nil {
		result.Error = "validation failed: " + err.Error()
		return finish()
	}
	dst := filepath.Join(dir, spec.File)
	if err := replaceFile(tmpPath, dst); err != nil {
		result.Error = err.Error()
		return finish()
	}
	result.Changed = true
	result.Bytes = n
	result.SHA256 = hex.EncodeToString(hash.Sum(nil))
	result.Status = "updated"
	if value := resp.Header.Get("ETag"); value != "" {
		meta.ETags[spec.Name] = value
	}
	if value := resp.Header.Get("Last-Modified"); value != "" {
		meta.LastModified[spec.Name] = value
	}
	return finish()
}

func validateDownloaded(path string, spec sourceSpec) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	raw, err := io.ReadAll(io.LimitReader(f, 256*1024))
	if err != nil {
		return err
	}
	sample := string(raw)
	if spec.File == "ipsum.txt" {
		if !strings.Contains(sample, "#") || !strings.Contains(sample, "\t") {
			return fmt.Errorf("unexpected IPsum format")
		}
		return nil
	}
	if strings.HasSuffix(spec.File, ".csv") {
		if !strings.Contains(sample, ",") {
			return fmt.Errorf("unexpected CSV format")
		}
		return nil
	}
	if !strings.ContainsAny(sample, "./:") {
		return fmt.Errorf("no IP address or prefix found")
	}
	return nil
}

func readMeta(path string) updateMeta {
	meta := updateMeta{
		ETags:        make(map[string]string),
		LastModified: make(map[string]string),
	}
	raw, err := os.ReadFile(path)
	if err == nil {
		_ = json.Unmarshal(raw, &meta)
	}
	if meta.ETags == nil {
		meta.ETags = make(map[string]string)
	}
	if meta.LastModified == nil {
		meta.LastModified = make(map[string]string)
	}
	return meta
}

func replaceFile(src, dst string) error {
	if err := os.Rename(src, dst); err == nil {
		return nil
	}
	// Windows cannot atomically replace an existing file. This fallback is
	// mostly for development; OpenWrt takes the atomic branch above.
	if err := os.Remove(dst); err != nil && !os.IsNotExist(err) {
		return err
	}
	return os.Rename(src, dst)
}

func writeAtomic(path string, raw []byte, mode os.FileMode) error {
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
	if err := tmp.Chmod(mode); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	return replaceFile(tmpPath, path)
}
