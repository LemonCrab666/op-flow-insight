package nss

import (
	"bufio"
	"fmt"
	"io"
	"net/netip"
	"strconv"
	"strings"
)

// Entry represents one hardware-offloaded flow entry from PPE debugfs.
type Entry struct {
	Index     string        // hex index in PPE table
	State     string        // ACT/UNB/FIN etc.
	Protocol  string        // TCP/UDP/IPv4/IPv6
	SrcIP     netip.Addr
	SrcPort   uint16
	DstIP     netip.Addr
	DstPort   uint16
	Packets   uint64
	Bytes     uint64
	Direction string // "upload" if src is LAN, "download" if dst is LAN
}

// PPEIndex selects which PPE engine to read.
type PPEIndex int

const (
	PPE0 PPEIndex = 0
	PPE1 PPEIndex = 1
)

// Parse reads and parses all entries from one PPE debugfs file.
func Parse(r io.Reader, lanPrefixes []netip.Prefix) ([]Entry, error) {
	var entries []Entry
	scanner := bufio.NewScanner(r)
	lineNo := 0

	for scanner.Scan() {
		lineNo++
		line := scanner.Text()
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		entry, err := parseLine(line, lanPrefixes)
		if err != nil {
			continue // skip malformed lines silently
		}
		entries = append(entries, entry)
	}

	return entries, scanner.Err()
}

func parseLine(line string, lanPrefixes []netip.Prefix) (Entry, error) {
	var e Entry

	// Format:
	// INDEX STATE TYPE orig=SRC:PORT->DST:PORT ... packets=N bytes=N
	//
	// Example:
	// 00504 FIN IPv4 5T orig=192.168.1.11:36558->60.28.220.199:443 ... packets=648 bytes=934343

	parts := strings.Fields(line)
	if len(parts) < 4 {
		return e, fmt.Errorf("too few fields")
	}

	e.Index = parts[0]
	e.State = parts[1]
	e.Protocol = parts[2] // e.g. "IPv4", "IPv6"

	// Find the "orig=" field
	var origField string
	packetsField := ""
	bytesField := ""

	for _, p := range parts {
		if strings.HasPrefix(p, "orig=") {
			origField = strings.TrimPrefix(p, "orig=")
		}
		if strings.HasPrefix(p, "packets=") {
			packetsField = strings.TrimPrefix(p, "packets=")
		}
		if strings.HasPrefix(p, "bytes=") {
			bytesField = strings.TrimPrefix(p, "bytes=")
		}
	}

	if origField == "" {
		return e, fmt.Errorf("missing orig= field")
	}

	// Parse orig=SRC:PORT->DST:PORT
	arrowIdx := strings.Index(origField, "->")
	if arrowIdx < 0 {
		return e, fmt.Errorf("missing -> in orig field")
	}

	srcStr := origField[:arrowIdx]
	dstStr := origField[arrowIdx+2:]

	srcAddr, srcPort, err := splitHostPort(srcStr)
	if err != nil {
		return e, fmt.Errorf("bad src %q: %w", srcStr, err)
	}
	dstAddr, dstPort, err := splitHostPort(dstStr)
	if err != nil {
		return e, fmt.Errorf("bad dst %q: %w", dstStr, err)
	}

	e.SrcIP = srcAddr
	e.SrcPort = srcPort
	e.DstIP = dstAddr
	e.DstPort = dstPort

	if packetsField != "" {
		e.Packets, _ = strconv.ParseUint(packetsField, 10, 64)
	}
	if bytesField != "" {
		e.Bytes, _ = strconv.ParseUint(bytesField, 10, 64)
	}

	// Determine direction based on LAN prefixes
	if isLAN(srcAddr, lanPrefixes) && !isLAN(dstAddr, lanPrefixes) {
		e.Direction = "upload"
	} else if isLAN(dstAddr, lanPrefixes) && !isLAN(srcAddr, lanPrefixes) {
		e.Direction = "download"
	} else {
		e.Direction = "local"
	}

	return e, nil
}

func splitHostPort(s string) (netip.Addr, uint16, error) {
	// Handle IPv6: [addr]:port or addr:port
	var host string
	var portStr string

	if strings.HasPrefix(s, "[") {
		// IPv6: [::1]:443
		closeBracket := strings.LastIndex(s, "]")
		if closeBracket < 0 {
			return netip.Addr{}, 0, fmt.Errorf("unclosed bracket")
		}
		host = s[1:closeBracket]
		if closeBracket+2 <= len(s) {
			portStr = s[closeBracket+2:]
		}
	} else {
		// IPv4 or IPv6 without brackets
		lastColon := strings.LastIndex(s, ":")
		if lastColon < 0 {
			return netip.Addr{}, 0, fmt.Errorf("no port")
		}
		host = s[:lastColon]
		portStr = s[lastColon+1:]
	}

	addr, err := netip.ParseAddr(host)
	if err != nil {
		return netip.Addr{}, 0, err
	}

	var port uint16
	if portStr != "" {
		p, err := strconv.ParseUint(portStr, 10, 16)
		if err != nil {
			return netip.Addr{}, 0, err
		}
		port = uint16(p)
	}

	return addr, port, nil
}

func isLAN(addr netip.Addr, prefixes []netip.Prefix) bool {
	for _, p := range prefixes {
		if p.Contains(addr) {
			return true
		}
	}
	return false
}
