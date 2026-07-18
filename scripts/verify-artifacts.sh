#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 3 ]]; then
	echo "usage: $0 package.apk package.ipk /path/to/sdk-apk-tool" >&2
	exit 2
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APK="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
IPK="$(cd "$(dirname "$2")" && pwd)/$(basename "$2")"
APK_TOOL="$(cd "$(dirname "$3")" && pwd)/$(basename "$3")"
APK_ROOT="$(mktemp -d)"
IPK_ROOT="$(mktemp -d)"

cleanup() {
	rm -rf "$APK_ROOT" "$IPK_ROOT"
}
trap cleanup EXIT

echo "[artifacts]"
ls -lh "$APK" "$IPK"

echo "[sha256]"
sha256sum "$APK" "$IPK"

echo "[apk metadata]"
"$APK_TOOL" adbdump --format json "$APK" |
	awk '/"paths":/ { exit } { print }'

echo "[apk signature]"
"$APK_TOOL" verify --allow-untrusted "$APK"
"$APK_TOOL" extract --allow-untrusted --destination "$APK_ROOT" "$APK" >/dev/null
cmp "$ROOT/openwrt/rootfs/www/luci-static/resources/op-flow.css" \
	"$APK_ROOT/www/luci-static/resources/op-flow.css"
cmp "$ROOT/openwrt/rootfs/www/luci-static/resources/view/status/op_flow.js" \
	"$APK_ROOT/www/luci-static/resources/view/status/op_flow.js"
"$APK_ROOT/usr/sbin/op-flowd" -version

echo "[ipk container]"
tar -tzf "$IPK"
tar -xzf "$IPK" -C "$IPK_ROOT"
tar -xzf "$IPK_ROOT/control.tar.gz" -C "$IPK_ROOT"
grep -E '^(Package|Version|Architecture|Depends):' "$IPK_ROOT/control"
mkdir "$IPK_ROOT/root"
tar -xzf "$IPK_ROOT/data.tar.gz" -C "$IPK_ROOT/root"
cmp "$ROOT/openwrt/rootfs/www/luci-static/resources/op-flow.css" \
	"$IPK_ROOT/root/www/luci-static/resources/op-flow.css"
cmp "$ROOT/openwrt/rootfs/www/luci-static/resources/view/status/op_flow.js" \
	"$IPK_ROOT/root/www/luci-static/resources/view/status/op_flow.js"
"$IPK_ROOT/root/usr/sbin/op-flowd" -version

echo "[binary]"
file "$APK_ROOT/usr/sbin/op-flowd" "$IPK_ROOT/root/usr/sbin/op-flowd"
