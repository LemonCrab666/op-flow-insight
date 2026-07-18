package dataset

import (
	"bufio"
	"bytes"
	"encoding/binary"
	"encoding/csv"
	"errors"
	"fmt"
	"io"
	"net/netip"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/op-flow-insight/op-flow-insight/internal/model"
)

type country4 struct {
	Start uint32
	End   uint32
	Code  string
}

type country6 struct {
	Start [16]byte
	End   [16]byte
	Code  string
}

type asn4 struct {
	Start uint32
	End   uint32
	ASN   uint32
	Org   string
}

type asn6 struct {
	Start [16]byte
	End   [16]byte
	ASN   uint32
	Org   string
}

type ipScore4 struct {
	IP   uint32
	Hits uint8
}

type ipScore6 struct {
	IP   [16]byte
	Hits uint8
}

type riskSource struct {
	Name     string
	Category string
	Severity int
	V4       []range4
	V6       []range6
}

type Database struct {
	country4  []country4
	country6  []country6
	asn4      []asn4
	asn6      []asn6
	ipsum4    []ipScore4
	ipsum6    []ipScore6
	risk      []riskSource
	records   map[string]int
	countries map[string]string
	orgs      map[string]string
}

type Manager struct {
	mu      sync.RWMutex
	db      *Database
	status  model.DataStatus
	dataDir string
}

func NewManager(dataDir string) *Manager {
	return &Manager{
		dataDir: dataDir,
		db: &Database{
			records: make(map[string]int), countries: make(map[string]string),
			orgs: make(map[string]string),
		},
		status: model.DataStatus{
			Sources: make(map[string]string),
			Records: make(map[string]int),
		},
	}
}

func (m *Manager) Reload() error {
	db, status, err := Load(m.dataDir)
	m.mu.Lock()
	defer m.mu.Unlock()
	if err != nil {
		m.status.LastUpdateError = err.Error()
		return err
	}
	status.UpdateRunning = m.status.UpdateRunning
	if status.LastUpdateError == "" {
		status.LastUpdateError = m.status.LastUpdateError
	}
	m.db = db
	m.status = status
	return nil
}

func (m *Manager) Lookup(addr netip.Addr) (model.Geo, model.Risk) {
	if !addr.IsValid() {
		return model.Geo{}, model.Risk{Level: riskLevel(0)}
	}
	if addr.IsPrivate() || addr.IsLoopback() || addr.IsLinkLocalUnicast() {
		return model.Geo{CountryCode: "LAN"}, model.Risk{Level: riskLevel(0)}
	}
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.db.lookup(addr)
}

func (m *Manager) Status() model.DataStatus {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := m.status
	out.Sources = cloneStringMap(m.status.Sources)
	out.Records = cloneIntMap(m.status.Records)
	return out
}

func (m *Manager) SetUpdateState(running bool, err error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.status.UpdateRunning = running
	if err != nil {
		m.status.LastUpdateError = err.Error()
	} else if !running {
		m.status.LastUpdateError = ""
	}
}

func Load(dir string) (*Database, model.DataStatus, error) {
	db := &Database{
		records: make(map[string]int), countries: make(map[string]string),
		orgs: make(map[string]string),
	}
	status := model.DataStatus{
		Sources: make(map[string]string),
		Records: make(map[string]int),
	}
	loaders := []struct {
		name string
		file string
		fn   func(string) (int, error)
	}{
		{"country_ipv4", "user-country-ipv4.csv", func(path string) (int, error) {
			return db.loadCountry(path, true)
		}},
		{"country_ipv6", "user-country-ipv6.csv", func(path string) (int, error) {
			return db.loadCountry(path, false)
		}},
		{"asn_ipv4", "origin-asn-ipv4.csv", func(path string) (int, error) {
			return db.loadASN(path, true)
		}},
		{"asn_ipv6", "origin-asn-ipv6.csv", func(path string) (int, error) {
			return db.loadASN(path, false)
		}},
		{"ipsum", "ipsum.txt", db.loadIPsum},
	}
	var newest time.Time
	var loaded int
	var loadErrors []error
	for _, item := range loaders {
		path := filepath.Join(dir, item.file)
		info, err := os.Stat(path)
		if err != nil {
			if !os.IsNotExist(err) {
				loadErrors = append(loadErrors, fmt.Errorf("%s: %w", item.name, err))
			}
			continue
		}
		count, err := item.fn(path)
		if err != nil {
			loadErrors = append(loadErrors, fmt.Errorf("%s: %w", item.name, err))
			continue
		}
		loaded++
		status.Sources[item.name] = info.ModTime().UTC().Format(time.RFC3339)
		status.Records[item.name] = count
		if info.ModTime().After(newest) {
			newest = info.ModTime()
		}
	}
	for _, spec := range riskSpecs {
		path := filepath.Join(dir, spec.File)
		info, err := os.Stat(path)
		if err != nil {
			continue
		}
		count, err := db.loadRiskFile(path, spec)
		if err != nil {
			loadErrors = append(loadErrors, fmt.Errorf("%s: %w", spec.Name, err))
			continue
		}
		loaded++
		status.Sources[spec.Name] = info.ModTime().UTC().Format(time.RFC3339)
		status.Records[spec.Name] = count
		if info.ModTime().After(newest) {
			newest = info.ModTime()
		}
	}
	db.sort()
	status.Loaded = loaded > 0
	status.UpdatedAt = newest.UTC()
	db.records = cloneIntMap(status.Records)
	if loaded == 0 && len(loadErrors) > 0 {
		return db, status, errors.Join(loadErrors...)
	}
	if len(loadErrors) > 0 {
		status.LastUpdateError = errors.Join(loadErrors...).Error()
	}
	return db, status, nil
}

func (db *Database) loadCountry(path string, ipv4 bool) (int, error) {
	return readCSV(path, func(row []string) bool {
		if len(row) < 3 {
			return false
		}
		start, err1 := netip.ParseAddr(strings.TrimSpace(row[0]))
		end, err2 := netip.ParseAddr(strings.TrimSpace(row[1]))
		if err1 != nil || err2 != nil || start.Is4() != ipv4 || end.Is4() != ipv4 {
			return false
		}
		code := db.intern(db.countries, strings.ToUpper(strings.TrimSpace(row[2])))
		if ipv4 {
			db.country4 = append(db.country4, country4{addr4(start), addr4(end), code})
		} else {
			db.country6 = append(db.country6, country6{start.As16(), end.As16(), code})
		}
		return true
	})
}

func (db *Database) loadASN(path string, ipv4 bool) (int, error) {
	return readCSV(path, func(row []string) bool {
		if len(row) < 4 {
			return false
		}
		start, err1 := netip.ParseAddr(strings.TrimSpace(row[0]))
		end, err2 := netip.ParseAddr(strings.TrimSpace(row[1]))
		asnRaw := strings.TrimPrefix(strings.ToUpper(strings.TrimSpace(row[2])), "AS")
		asn64, err3 := strconv.ParseUint(asnRaw, 10, 32)
		if err1 != nil || err2 != nil || err3 != nil || start.Is4() != ipv4 || end.Is4() != ipv4 {
			return false
		}
		org := db.intern(db.orgs, strings.TrimSpace(row[3]))
		if ipv4 {
			db.asn4 = append(db.asn4, asn4{addr4(start), addr4(end), uint32(asn64), org})
		} else {
			db.asn6 = append(db.asn6, asn6{start.As16(), end.As16(), uint32(asn64), org})
		}
		return true
	})
}

func (db *Database) intern(table map[string]string, value string) string {
	if existing, ok := table[value]; ok {
		return existing
	}
	table[value] = value
	return value
}

func readCSV(path string, accept func([]string) bool) (int, error) {
	f, err := os.Open(path)
	if err != nil {
		return 0, err
	}
	defer f.Close()
	r := csv.NewReader(bufio.NewReaderSize(f, 256*1024))
	r.FieldsPerRecord = -1
	r.ReuseRecord = true
	r.LazyQuotes = true
	count := 0
	for {
		row, err := r.Read()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return count, err
		}
		if accept(row) {
			count++
		}
	}
	return count, nil
}

func (db *Database) loadIPsum(path string) (int, error) {
	f, err := os.Open(path)
	if err != nil {
		return 0, err
	}
	defer f.Close()
	count := 0
	s := bufio.NewScanner(f)
	s.Buffer(make([]byte, 64*1024), 1024*1024)
	for s.Scan() {
		line := strings.TrimSpace(s.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}
		addr, parseErr := netip.ParseAddr(fields[0])
		hits, hitsErr := strconv.ParseUint(fields[1], 10, 8)
		if parseErr != nil || hitsErr != nil {
			continue
		}
		if hits > 255 {
			hits = 255
		}
		if addr.Is4() {
			db.ipsum4 = append(db.ipsum4, ipScore4{addr4(addr), uint8(hits)})
		} else {
			db.ipsum6 = append(db.ipsum6, ipScore6{addr.As16(), uint8(hits)})
		}
		count++
	}
	return count, s.Err()
}

func (db *Database) loadRiskFile(path string, spec sourceSpec) (int, error) {
	f, err := os.Open(path)
	if err != nil {
		return 0, err
	}
	defer f.Close()
	source := riskSource{Name: spec.Name, Category: spec.Category, Severity: spec.Severity}
	s := bufio.NewScanner(f)
	s.Buffer(make([]byte, 64*1024), 1024*1024)
	count := 0
	for s.Scan() {
		line := strings.TrimSpace(s.Text())
		if line == "" || strings.HasPrefix(line, "#") || strings.HasPrefix(line, ";") {
			continue
		}
		token := strings.Fields(line)[0]
		var prefix netip.Prefix
		if strings.Contains(token, "/") {
			prefix, err = netip.ParsePrefix(token)
		} else {
			var addr netip.Addr
			addr, err = netip.ParseAddr(token)
			if err == nil {
				prefix = netip.PrefixFrom(addr, addr.BitLen())
			}
		}
		if err != nil || !prefix.IsValid() {
			continue
		}
		v4, v6, is4 := prefixRange(prefix)
		if is4 {
			source.V4 = append(source.V4, v4)
		} else {
			source.V6 = append(source.V6, v6)
		}
		count++
	}
	if err := s.Err(); err != nil {
		return count, err
	}
	source.V4 = merge4(source.V4)
	source.V6 = merge6(source.V6)
	db.risk = append(db.risk, source)
	return count, nil
}

func (db *Database) sort() {
	sort.Slice(db.country4, func(i, j int) bool { return db.country4[i].Start < db.country4[j].Start })
	sort.Slice(db.country6, func(i, j int) bool {
		return bytes.Compare(db.country6[i].Start[:], db.country6[j].Start[:]) < 0
	})
	sort.Slice(db.asn4, func(i, j int) bool { return db.asn4[i].Start < db.asn4[j].Start })
	sort.Slice(db.asn6, func(i, j int) bool {
		return bytes.Compare(db.asn6[i].Start[:], db.asn6[j].Start[:]) < 0
	})
	sort.Slice(db.ipsum4, func(i, j int) bool { return db.ipsum4[i].IP < db.ipsum4[j].IP })
	sort.Slice(db.ipsum6, func(i, j int) bool {
		return bytes.Compare(db.ipsum6[i].IP[:], db.ipsum6[j].IP[:]) < 0
	})
}

func (db *Database) lookup(addr netip.Addr) (model.Geo, model.Risk) {
	var geo model.Geo
	var evidence []model.Evidence
	if addr.Is4() {
		value := addr4(addr)
		if item, ok := findCountry4(db.country4, value); ok {
			geo.CountryCode = item.Code
		}
		if item, ok := findASN4(db.asn4, value); ok {
			geo.ASN, geo.ASNOrg = item.ASN, item.Org
		}
		if hits := findIPsum4(db.ipsum4, value); hits > 0 {
			severity := ipsumSeverity(hits)
			evidence = append(evidence, model.Evidence{
				Source: "IPsum", Category: "multi-list", Severity: severity,
				Detail: fmt.Sprintf("appears on %d upstream blacklists", hits),
			})
		}
		for _, source := range db.risk {
			if contains4(source.V4, value) {
				evidence = append(evidence, model.Evidence{
					Source: source.Name, Category: source.Category, Severity: source.Severity,
				})
			}
		}
	} else {
		value := addr.As16()
		if item, ok := findCountry6(db.country6, value); ok {
			geo.CountryCode = item.Code
		}
		if item, ok := findASN6(db.asn6, value); ok {
			geo.ASN, geo.ASNOrg = item.ASN, item.Org
		}
		if hits := findIPsum6(db.ipsum6, value); hits > 0 {
			severity := ipsumSeverity(hits)
			evidence = append(evidence, model.Evidence{
				Source: "IPsum", Category: "multi-list", Severity: severity,
				Detail: fmt.Sprintf("appears on %d upstream blacklists", hits),
			})
		}
		for _, source := range db.risk {
			if contains6(source.V6, value) {
				evidence = append(evidence, model.Evidence{
					Source: source.Name, Category: source.Category, Severity: source.Severity,
				})
			}
		}
	}
	sort.Slice(evidence, func(i, j int) bool { return evidence[i].Severity > evidence[j].Severity })
	score := 0
	if len(evidence) > 0 {
		score = evidence[0].Severity + 5*(len(evidence)-1)
		if score > 100 {
			score = 100
		}
	}
	return geo, model.Risk{Score: score, Level: riskLevel(score), Evidence: evidence}
}

func findCountry4(items []country4, value uint32) (country4, bool) {
	i := sort.Search(len(items), func(i int) bool { return items[i].Start > value })
	if i > 0 && value <= items[i-1].End {
		return items[i-1], true
	}
	return country4{}, false
}

func findCountry6(items []country6, value [16]byte) (country6, bool) {
	i := sort.Search(len(items), func(i int) bool {
		return bytes.Compare(items[i].Start[:], value[:]) > 0
	})
	if i > 0 && bytes.Compare(value[:], items[i-1].End[:]) <= 0 {
		return items[i-1], true
	}
	return country6{}, false
}

func findASN4(items []asn4, value uint32) (asn4, bool) {
	i := sort.Search(len(items), func(i int) bool { return items[i].Start > value })
	if i > 0 && value <= items[i-1].End {
		return items[i-1], true
	}
	return asn4{}, false
}

func findASN6(items []asn6, value [16]byte) (asn6, bool) {
	i := sort.Search(len(items), func(i int) bool {
		return bytes.Compare(items[i].Start[:], value[:]) > 0
	})
	if i > 0 && bytes.Compare(value[:], items[i-1].End[:]) <= 0 {
		return items[i-1], true
	}
	return asn6{}, false
}

func findIPsum4(items []ipScore4, value uint32) uint8 {
	i := sort.Search(len(items), func(i int) bool { return items[i].IP >= value })
	if i < len(items) && items[i].IP == value {
		return items[i].Hits
	}
	return 0
}

func findIPsum6(items []ipScore6, value [16]byte) uint8 {
	i := sort.Search(len(items), func(i int) bool {
		return bytes.Compare(items[i].IP[:], value[:]) >= 0
	})
	if i < len(items) && bytes.Equal(items[i].IP[:], value[:]) {
		return items[i].Hits
	}
	return 0
}

func ipsumSeverity(hits uint8) int {
	switch {
	case hits >= 8:
		return 90
	case hits == 7:
		return 86
	case hits == 6:
		return 80
	case hits == 5:
		return 72
	case hits == 4:
		return 62
	case hits == 3:
		return 50
	case hits == 2:
		return 35
	default:
		return 20
	}
}

func riskLevel(score int) string {
	switch {
	case score >= 80:
		return "critical"
	case score >= 60:
		return "high"
	case score >= 40:
		return "medium"
	case score >= 20:
		return "guarded"
	default:
		return "low"
	}
}

func cloneStringMap(in map[string]string) map[string]string {
	out := make(map[string]string, len(in))
	for k, v := range in {
		out[k] = v
	}
	return out
}

func cloneIntMap(in map[string]int) map[string]int {
	out := make(map[string]int, len(in))
	for k, v := range in {
		out[k] = v
	}
	return out
}

// Keep encoding/binary referenced by older Go vet versions that otherwise
// report the platform-specific uint32 conversion helper as suspicious.
var _ = binary.BigEndian
