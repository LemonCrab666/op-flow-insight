#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
	echo "usage: $0 /path/to/immortalwrt-24.10.6-x86_64-sdk" >&2
	exit 2
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SDK="$(cd "$1" && pwd)"
VERSION="$(sed -n 's/^PKG_VERSION:=//p' "$ROOT/openwrt/package/Makefile")"
PACKAGE_DIR="$SDK/package/op-flow-insight"

if [[ ! -f "$SDK/Makefile" ]]; then
	echo "not an extracted ImmortalWrt/OpenWrt SDK: $SDK" >&2
	exit 2
fi

mkdir -p "$ROOT/dist/bin"
(
	cd "$ROOT"
	CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
		go build -trimpath -ldflags="-s -w -X main.version=$VERSION" \
		-o "$ROOT/dist/bin/op-flowd-linux-amd64" ./cmd/op-flowd
)

rm -rf "$PACKAGE_DIR"
mkdir -p "$PACKAGE_DIR/files"
cp "$ROOT/openwrt/package/Makefile" "$PACKAGE_DIR/Makefile"
cp -a "$ROOT/openwrt/rootfs" "$PACKAGE_DIR/files/rootfs"
cp "$ROOT/dist/bin/op-flowd-linux-amd64" "$PACKAGE_DIR/files/op-flowd"
cp "$ROOT/LICENSE" "$PACKAGE_DIR/LICENSE"

if [[ -d "$SDK/bin" ]]; then
	find "$SDK/bin" -type f -name 'op-flow-insight_*.ipk' -delete
fi
make -C "$SDK" defconfig
make -C "$SDK" package/op-flow-insight/clean
make -C "$SDK" package/op-flow-insight/compile V=s -j"$(nproc)"

mkdir -p "$ROOT/dist"
find "$ROOT/dist" -maxdepth 1 -type f -name 'op-flow-insight_*.ipk*' -delete
find "$SDK/bin" -type f -name 'op-flow-insight_*.ipk' -exec cp -v {} "$ROOT/dist/" \;

IPK="$(find "$ROOT/dist" -maxdepth 1 -type f -name 'op-flow-insight_*.ipk' | sort | tail -n 1)"
if [[ -z "$IPK" ]]; then
	echo "ImmortalWrt/OpenWrt SDK completed without producing an IPK" >&2
	exit 1
fi

(
	cd "$(dirname "$IPK")"
	sha256sum "$(basename "$IPK")" > "$(basename "$IPK").sha256"
)

printf 'built %s\n' "$IPK"
