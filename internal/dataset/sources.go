package dataset

type sourceSpec struct {
	Name     string
	File     string
	URL      string
	Category string
	Severity int
	MaxBytes int64
}

var geoSpecs = []sourceSpec{
	{
		Name: "country_ipv4", File: "user-country-ipv4.csv",
		URL:      "https://github.com/sapics/ip-location-db/releases/download/latest/user-country-ipv4.csv",
		MaxBytes: 128 << 20,
	},
	{
		Name: "country_ipv6", File: "user-country-ipv6.csv",
		URL:      "https://github.com/sapics/ip-location-db/releases/download/latest/user-country-ipv6.csv",
		MaxBytes: 128 << 20,
	},
	{
		Name: "asn_ipv4", File: "origin-asn-ipv4.csv",
		URL:      "https://github.com/sapics/ip-location-db/releases/download/latest/origin-asn-ipv4.csv",
		MaxBytes: 192 << 20,
	},
	{
		Name: "asn_ipv6", File: "origin-asn-ipv6.csv",
		URL:      "https://github.com/sapics/ip-location-db/releases/download/latest/origin-asn-ipv6.csv",
		MaxBytes: 192 << 20,
	},
	{
		Name: "ipsum", File: "ipsum.txt",
		URL:      "https://raw.githubusercontent.com/stamparm/ipsum/master/ipsum.txt",
		MaxBytes: 128 << 20,
	},
}

var riskSpecs = []sourceSpec{
	{
		Name: "Spamhaus DROP", File: "spamhaus_drop.netset",
		URL:      "https://raw.githubusercontent.com/firehol/blocklist-ipsets/master/spamhaus_drop.netset",
		Category: "spam/cybercrime", Severity: 95, MaxBytes: 16 << 20,
	},
	{
		Name: "Spamhaus EDROP", File: "spamhaus_edrop.netset",
		URL:      "https://raw.githubusercontent.com/firehol/blocklist-ipsets/master/spamhaus_edrop.netset",
		Category: "spam/cybercrime", Severity: 95, MaxBytes: 16 << 20,
	},
	{
		Name: "Feodo Tracker", File: "feodo.ipset",
		URL:      "https://raw.githubusercontent.com/firehol/blocklist-ipsets/master/feodo.ipset",
		Category: "botnet/c2", Severity: 90, MaxBytes: 16 << 20,
	},
	{
		Name: "DShield", File: "dshield.netset",
		URL:      "https://raw.githubusercontent.com/firehol/blocklist-ipsets/master/dshield.netset",
		Category: "recent-attacker", Severity: 70, MaxBytes: 16 << 20,
	},
	{
		Name: "Blocklist Project Abuse", File: "blocklistproject-abuse.ip",
		URL:      "https://raw.githubusercontent.com/blocklistproject/Lists/master/abuse.ip",
		Category: "abuse", Severity: 65, MaxBytes: 64 << 20,
	},
	{
		Name: "Blocklist Project Malware", File: "blocklistproject-malware.ip",
		URL:      "https://raw.githubusercontent.com/blocklistproject/Lists/master/malware.ip",
		Category: "malware", Severity: 85, MaxBytes: 64 << 20,
	},
}

func allSpecs() []sourceSpec {
	out := make([]sourceSpec, 0, len(geoSpecs)+len(riskSpecs))
	out = append(out, geoSpecs...)
	out = append(out, riskSpecs...)
	return out
}
