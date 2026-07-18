#!/usr/bin/env python3
"""Validate LuCI translation catalogs without external Python dependencies."""

from __future__ import annotations

import ast
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
JS_FILES = [
    ROOT / "openwrt/rootfs/www/luci-static/resources/view/status/op_flow.js",
    ROOT / "openwrt/rootfs/www/luci-static/resources/view/op_flow/settings.js",
]
MENU_FILE = ROOT / "openwrt/rootfs/usr/share/luci/menu.d/luci-app-op-flow.json"
CATALOGS = [
    ROOT / "openwrt/package/po/zh_Hans/op-flow.po",
    ROOT / "openwrt/package/po/ja/op-flow.po",
]
DYNAMIC_MESSAGES = {
    "Conntrack byte counters are unavailable; enable "
    "net.netfilter.nf_conntrack_acct=1 and establish new connections",
}


def js_messages() -> set[str]:
    messages: set[str] = set(DYNAMIC_MESSAGES)
    pattern = re.compile(r"_\('((?:\\.|[^'\\])*)'\)")
    for path in JS_FILES:
        source = path.read_text(encoding="utf-8")
        for match in pattern.finditer(source):
            raw = match.group(1)
            messages.add(raw.replace("\\'", "'").replace("\\\\", "\\"))

    menu = json.loads(MENU_FILE.read_text(encoding="utf-8"))
    messages.update(item["title"] for item in menu.values())
    return messages


def parse_po(path: Path) -> dict[str, str]:
    entries: dict[str, str] = {}
    field: str | None = None
    msgid = ""
    msgstr = ""

    def finish() -> None:
        nonlocal msgid, msgstr
        if msgid:
            if msgid in entries:
                raise ValueError(f"{path}: duplicate msgid {msgid!r}")
            entries[msgid] = msgstr
        msgid = ""
        msgstr = ""

    for raw_line in path.read_text(encoding="utf-8").splitlines() + [""]:
        line = raw_line.strip()
        if line.startswith("msgid "):
            finish()
            field = "msgid"
            msgid = ast.literal_eval(line[6:])
        elif line.startswith("msgstr "):
            field = "msgstr"
            msgstr = ast.literal_eval(line[7:])
        elif line.startswith('"'):
            value = ast.literal_eval(line)
            if field == "msgid":
                msgid += value
            elif field == "msgstr":
                msgstr += value
        elif not line:
            finish()
            field = None

    return entries


def main() -> None:
    expected = js_messages()
    for catalog in CATALOGS:
        entries = parse_po(catalog)
        missing = sorted(expected - entries.keys())
        empty = sorted(message for message in expected if not entries.get(message))
        extra = sorted(entries.keys() - expected)
        if missing or empty or extra:
            details = []
            if missing:
                details.append(f"missing={missing}")
            if empty:
                details.append(f"empty={empty}")
            if extra:
                details.append(f"extra={extra}")
            raise SystemExit(f"{catalog}: " + "; ".join(details))
        print(f"{catalog.relative_to(ROOT)}: {len(entries)} translated messages")

    print(f"translation coverage: {len(expected)} messages, OK")


if __name__ == "__main__":
    main()
