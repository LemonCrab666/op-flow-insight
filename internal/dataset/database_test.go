package dataset

import (
	"net/netip"
	"os"
	"path/filepath"
	"testing"
)

func TestLookupAndRiskScore(t *testing.T) {
	dir := t.TempDir()
	files := map[string]string{
		"user-country-ipv4.csv": "1.1.1.0,1.1.1.255,AU\n",
		"origin-asn-ipv4.csv":   "1.1.1.0,1.1.1.255,13335,Cloudflare\n",
		"ipsum.txt":             "# IP\tblacklist count\n1.1.1.1\t3\n",
		"feodo.ipset":           "1.1.1.1\n",
	}
	for name, body := range files {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	db, status, err := Load(dir)
	if err != nil {
		t.Fatal(err)
	}
	if !status.Loaded {
		t.Fatal("database should be loaded")
	}
	geo, risk := db.lookup(netip.MustParseAddr("1.1.1.1"))
	if geo.CountryCode != "AU" || geo.ASN != 13335 {
		t.Fatalf("unexpected geo: %+v", geo)
	}
	// Feodo 90 plus one corroborating IPsum source.
	if risk.Score != 95 || len(risk.Evidence) != 2 {
		t.Fatalf("unexpected risk: %+v", risk)
	}
}

func TestPrefixRanges(t *testing.T) {
	v4, _, is4 := prefixRange(netip.MustParsePrefix("192.0.2.0/24"))
	if !is4 || v4.End-v4.Start != 255 {
		t.Fatalf("unexpected v4 range: %+v", v4)
	}
	items := merge4([]range4{{Start: 10, End: 20}, {Start: 21, End: 30}})
	if len(items) != 1 || !contains4(items, 25) {
		t.Fatalf("unexpected merge: %+v", items)
	}
}
