package dataset

import (
	"bytes"
	"encoding/binary"
	"net/netip"
	"sort"
)

type range4 struct {
	Start uint32
	End   uint32
}

type range6 struct {
	Start [16]byte
	End   [16]byte
}

func addr4(addr netip.Addr) uint32 {
	raw := addr.As4()
	return binary.BigEndian.Uint32(raw[:])
}

func prefixRange(prefix netip.Prefix) (range4, range6, bool) {
	prefix = prefix.Masked()
	addr := prefix.Addr()
	if addr.Is4() {
		start := addr4(addr)
		hostBits := 32 - prefix.Bits()
		var mask uint32
		if hostBits == 32 {
			mask = ^uint32(0)
		} else if hostBits > 0 {
			mask = (uint32(1) << hostBits) - 1
		}
		return range4{Start: start, End: start | mask}, range6{}, true
	}
	start := addr.As16()
	end := start
	for bit := prefix.Bits(); bit < 128; bit++ {
		end[bit/8] |= 1 << (7 - uint(bit%8))
	}
	return range4{}, range6{Start: start, End: end}, false
}

func merge4(items []range4) []range4 {
	if len(items) < 2 {
		return items
	}
	sort.Slice(items, func(i, j int) bool {
		if items[i].Start == items[j].Start {
			return items[i].End < items[j].End
		}
		return items[i].Start < items[j].Start
	})
	out := items[:1]
	for _, item := range items[1:] {
		last := &out[len(out)-1]
		adjacent := last.End != ^uint32(0) && item.Start == last.End+1
		if item.Start <= last.End || adjacent {
			if item.End > last.End {
				last.End = item.End
			}
			continue
		}
		out = append(out, item)
	}
	return out
}

func merge6(items []range6) []range6 {
	if len(items) < 2 {
		return items
	}
	sort.Slice(items, func(i, j int) bool {
		cmp := bytes.Compare(items[i].Start[:], items[j].Start[:])
		if cmp == 0 {
			return bytes.Compare(items[i].End[:], items[j].End[:]) < 0
		}
		return cmp < 0
	})
	out := items[:1]
	for _, item := range items[1:] {
		last := &out[len(out)-1]
		if bytes.Compare(item.Start[:], last.End[:]) <= 0 {
			if bytes.Compare(item.End[:], last.End[:]) > 0 {
				last.End = item.End
			}
			continue
		}
		out = append(out, item)
	}
	return out
}

func contains4(items []range4, value uint32) bool {
	i := sort.Search(len(items), func(i int) bool { return items[i].Start > value })
	if i == 0 {
		return false
	}
	return value <= items[i-1].End
}

func contains6(items []range6, value [16]byte) bool {
	i := sort.Search(len(items), func(i int) bool {
		return bytes.Compare(items[i].Start[:], value[:]) > 0
	})
	if i == 0 {
		return false
	}
	return bytes.Compare(value[:], items[i-1].End[:]) <= 0
}
