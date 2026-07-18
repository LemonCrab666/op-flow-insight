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
LANG_ROOT="$(mktemp -d)"

cleanup() {
	rm -rf "$APK_ROOT" "$IPK_ROOT" "$LANG_ROOT"
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

echo "[translations]"
for LANG in ja zh-cn; do
	LANG_APK="$(find "$(dirname "$APK")" -maxdepth 1 -type f \
		-name "luci-i18n-op-flow-$LANG-*.apk" | sort | tail -n 1)"
	LANG_IPK="$(find "$(dirname "$IPK")" -maxdepth 1 -type f \
		-name "luci-i18n-op-flow-${LANG}_*.ipk" | sort | tail -n 1)"
	if [[ -z "$LANG_APK" || -z "$LANG_IPK" ]]; then
		echo "missing $LANG APK or IPK translation package" >&2
		exit 1
	fi

	LANG_APK_ROOT="$LANG_ROOT/apk-$LANG"
	LANG_IPK_ROOT="$LANG_ROOT/ipk-$LANG"
	mkdir "$LANG_APK_ROOT" "$LANG_IPK_ROOT"

	"$APK_TOOL" verify --allow-untrusted "$LANG_APK"
	"$APK_TOOL" adbdump --format json "$LANG_APK" \
		> "$LANG_ROOT/$LANG.apk.json"
	grep -q "\"name\": \"luci-i18n-op-flow-$LANG\"" \
		"$LANG_ROOT/$LANG.apk.json"
	grep -q '"arch": "noarch"' "$LANG_ROOT/$LANG.apk.json"
	grep -q '"op-flow-insight"' "$LANG_ROOT/$LANG.apk.json"
	"$APK_TOOL" extract --allow-untrusted --destination "$LANG_APK_ROOT" \
		"$LANG_APK" >/dev/null

	tar -xOzf "$LANG_IPK" ./control.tar.gz |
		tar -xzO ./control > "$LANG_ROOT/$LANG.control"
	grep -q "^Package: luci-i18n-op-flow-$LANG$" \
		"$LANG_ROOT/$LANG.control"
	grep -q '^Architecture: all$' "$LANG_ROOT/$LANG.control"
	grep -q '^Depends: .*op-flow-insight' "$LANG_ROOT/$LANG.control"
	tar -xOzf "$LANG_IPK" ./data.tar.gz |
		tar -xz -C "$LANG_IPK_ROOT"

	cmp "$ROOT/dist/i18n/op-flow.$LANG.lmo" \
		"$LANG_APK_ROOT/usr/lib/lua/luci/i18n/op-flow.$LANG.lmo"
	cmp "$ROOT/dist/i18n/op-flow.$LANG.lmo" \
		"$LANG_IPK_ROOT/usr/lib/lua/luci/i18n/op-flow.$LANG.lmo"
	grep -E '^(Package|Version|Architecture|Depends):' \
		"$LANG_ROOT/$LANG.control"
done

echo "[release sha256]"
sha256sum "$(dirname "$APK")"/*.apk "$(dirname "$IPK")"/*.ipk
