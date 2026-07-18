package collector

import (
	"net/netip"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/op-flow-insight/op-flow-insight/internal/config"
	"github.com/op-flow-insight/op-flow-insight/internal/dataset"
	"github.com/op-flow-insight/op-flow-insight/internal/model"
)

func TestCumulativeDeltas(t *testing.T) {
	cfg := config.Default()
	cfg.StateFile = filepath.Join(t.TempDir(), "state.json")
	cfg.LANPrefixes = []netip.Prefix{netip.MustParsePrefix("192.168.1.0/24")}
	data := dataset.NewManager(t.TempDir())
	tracker, err := New(cfg, data, "test")
	if err != nil {
		t.Fatal(err)
	}
	first := "ipv4 2 tcp 6 100 ESTABLISHED src=192.168.1.23 dst=1.1.1.1 sport=50000 dport=443 packets=1 bytes=100 src=1.1.1.1 dst=192.168.1.23 sport=443 dport=50000 packets=2 bytes=1000 [ASSURED]\n"
	second := "ipv4 2 tcp 6 98 ESTABLISHED src=192.168.1.23 dst=1.1.1.1 sport=50000 dport=443 packets=2 bytes=150 src=1.1.1.1 dst=192.168.1.23 sport=443 dport=50000 packets=3 bytes=1200 [ASSURED]\n"
	now := time.Now().UTC()
	tracker.Poll(strings.NewReader(first), now)
	tracker.Poll(strings.NewReader(second), now.Add(2*time.Second))
	got := tracker.Snapshot()
	if got.Totals.Uploaded != 150 || got.Totals.Downloaded != 1200 {
		t.Fatalf("unexpected totals: %+v", got.Totals)
	}
	if got.Totals.UploadBPS != 25 || got.Totals.DownloadBPS != 100 {
		t.Fatalf("unexpected rates: %+v", got.Totals)
	}
	if len(got.Flows) != 1 || got.Flows[0].Source.IP != "192.168.1.23" {
		t.Fatalf("unexpected flows: %+v", got.Flows)
	}
}

func TestDNATInbound(t *testing.T) {
	cfg := config.Default()
	cfg.StateFile = filepath.Join(t.TempDir(), "state.json")
	cfg.LANPrefixes = []netip.Prefix{netip.MustParsePrefix("192.168.1.0/24")}
	tracker, _ := New(cfg, dataset.NewManager(t.TempDir()), "test")
	line := "ipv4 2 tcp 6 100 ESTABLISHED src=203.0.113.8 dst=198.51.100.10 sport=40000 dport=443 packets=4 bytes=800 src=192.168.1.50 dst=203.0.113.8 sport=8443 dport=40000 packets=3 bytes=600 [ASSURED]\n"
	tracker.Poll(strings.NewReader(line), time.Now().UTC())
	got := tracker.Snapshot()
	if len(got.Flows) != 1 || got.Flows[0].HostIP != "192.168.1.50" || got.Flows[0].Direction != "inbound" {
		t.Fatalf("unexpected flow: %+v", got.Flows)
	}
	if got.Totals.Uploaded != 600 || got.Totals.Downloaded != 800 {
		t.Fatalf("unexpected totals: %+v", got.Totals)
	}
}

func TestSnapshotHostsUseStableIPAddressOrder(t *testing.T) {
	cfg := config.Default()
	cfg.StateFile = filepath.Join(t.TempDir(), "state.json")
	tracker, err := New(cfg, dataset.NewManager(t.TempDir()), "test")
	if err != nil {
		t.Fatal(err)
	}
	tracker.hosts = map[string]model.Host{
		"192.168.1.100": {IP: "192.168.1.100", DownloadBPS: 9000},
		"2001:db8::10":  {IP: "2001:db8::10", DownloadBPS: 8000},
		"192.168.1.2":   {IP: "192.168.1.2", DownloadBPS: 1},
		"2001:db8::2":   {IP: "2001:db8::2", DownloadBPS: 2},
		"192.168.1.10":  {IP: "192.168.1.10", DownloadBPS: 10000},
	}

	got := tracker.Snapshot()
	want := []string{
		"192.168.1.2",
		"192.168.1.10",
		"192.168.1.100",
		"2001:db8::2",
		"2001:db8::10",
	}
	if len(got.Hosts) != len(want) {
		t.Fatalf("host count = %d, want %d", len(got.Hosts), len(want))
	}
	for index, host := range got.Hosts {
		if host.IP != want[index] {
			t.Fatalf("host[%d] = %s, want %s", index, host.IP, want[index])
		}
	}
}
