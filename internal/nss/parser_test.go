package nss

import (
	"strings"
	"testing"
	"net/netip"
)

func TestParse(t *testing.T) {
	input := `00210 UNB IPv4 5T orig=192.168.1.100:49886->194.221.250.50:443 new=36.3.3.0:0->10.14.240.0:0 eth=00:00:00:00:00:00->00:00:00:00:00:00 etype=0000 vlan=0,0 ib1=100008a6 ib2=8e646927 packets=0 bytes=0
00504 FIN IPv4 5T orig=192.168.1.11:36558->60.28.220.199:443 new=111.164.187.251:36558->60.28.220.199:443 eth=dc:d8:7c:5c:2f:f4->00:00:5e:00:04:03 etype=6488 vlan=0,0 ib1=305200a9 ib2=00f08501 packets=648 bytes=934343
01418 UNB IPv6 5T orig=2408:8210:5400:bc11:69da:4b90:82d4:b614:59595->2620:0149:00f9:1025:0000:0000:0000:0010:443 eth=dc:d8:7c:5c:2f:f4->00:00:5e:00:04:03 etype=6488 vlan=0,0 ib1=128008a5 ib2=00f08501 packets=5 bytes=418`

	lanPrefixes := []netip.Prefix{
		netip.MustParsePrefix("192.168.0.0/16"),
		netip.MustParsePrefix("10.0.0.0/8"),
	}

	entries, err := Parse(strings.NewReader(input), lanPrefixes)
	if err != nil {
		t.Fatalf("Parse failed: %v", err)
	}

	if len(entries) != 3 {
		t.Fatalf("expected 3 entries, got %d", len(entries))
	}

	// First entry: upload direction (LAN src)
	e := entries[0]
	if e.SrcIP.String() != "192.168.1.100" {
		t.Errorf("entry 0: expected src 192.168.1.100, got %s", e.SrcIP)
	}
	if e.SrcPort != 49886 {
		t.Errorf("entry 0: expected port 49886, got %d", e.SrcPort)
	}
	if e.DstIP.String() != "194.221.250.50" {
		t.Errorf("entry 0: expected dst 194.221.250.50, got %s", e.DstIP)
	}
	if e.Direction != "upload" {
		t.Errorf("entry 0: expected direction upload, got %s", e.Direction)
	}
	if e.Bytes != 0 {
		t.Errorf("entry 0: expected bytes=0, got %d", e.Bytes)
	}

	// Second entry: upload with real data
	e = entries[1]
	if e.SrcIP.String() != "192.168.1.11" {
		t.Errorf("entry 1: expected src 192.168.1.11, got %s", e.SrcIP)
	}
	if e.Bytes != 934343 {
		t.Errorf("entry 1: expected bytes=934343, got %d", e.Bytes)
	}
	if e.Packets != 648 {
		t.Errorf("entry 1: expected packets=648, got %d", e.Packets)
	}
	if e.Direction != "upload" {
		t.Errorf("entry 1: expected direction upload, got %s", e.Direction)
	}

	// Third entry: IPv6
	e = entries[2]
	if !e.SrcIP.Is6() {
		t.Errorf("entry 2: expected IPv6 src")
	}
	if e.DstPort != 443 {
		t.Errorf("entry 2: expected dst port 443, got %d", e.DstPort)
	}
}

func TestSplitHostPort(t *testing.T) {
	tests := []struct {
		input   string
		host    string
		port    uint16
		wantErr bool
	}{
		{"192.168.1.1:53", "192.168.1.1", 53, false},
		{"[::1]:443", "::1", 443, false},
		{"8.8.8.8:80", "8.8.8.8", 80, false},
	}

	for _, tt := range tests {
		addr, port, err := splitHostPort(tt.input)
		if tt.wantErr {
			if err == nil {
				t.Errorf("splitHostPort(%q): expected error", tt.input)
			}
			continue
		}
		if err != nil {
			t.Errorf("splitHostPort(%q): unexpected error: %v", tt.input, err)
			continue
		}
		if addr.String() != tt.host {
			t.Errorf("splitHostPort(%q): host=%s, want %s", tt.input, addr, tt.host)
		}
		if port != tt.port {
			t.Errorf("splitHostPort(%q): port=%d, want %d", tt.input, port, tt.port)
		}
	}
}
