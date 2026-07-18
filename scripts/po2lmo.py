#!/usr/bin/env python3
"""Compile the singular PO catalogs used by OP Flow Insight to LuCI LMO.

The binary layout and SuperFastHash implementation match LuCI's Apache-2.0
licensed po2lmo tool. Context and plural entries are rejected explicitly
because this project's catalogs do not use them.
"""

from __future__ import annotations

import ast
import struct
import sys
from pathlib import Path


MASK32 = 0xFFFFFFFF


def _u32(value: int) -> int:
    return value & MASK32


def _get16(data: bytes, offset: int) -> int:
    return data[offset] | (data[offset + 1] << 8)


def _signed_byte(value: int) -> int:
    return value if value < 0x80 else value - 0x100


def sfh_hash(data: bytes) -> int:
    """LuCI lmo.c SuperFastHash, including its signed trailing-byte behavior."""

    length = len(data)
    if not length:
        return 0

    value = length
    blocks, remainder = divmod(length, 4)
    offset = 0

    for _ in range(blocks):
        value = _u32(value + _get16(data, offset))
        temporary = _u32((_get16(data, offset + 2) << 11) ^ value)
        value = _u32((value << 16) ^ temporary)
        offset += 4
        value = _u32(value + (value >> 11))

    if remainder == 3:
        value = _u32(value + _get16(data, offset))
        value = _u32(value ^ (value << 16))
        value = _u32(value ^ (_signed_byte(data[offset + 2]) << 18))
        value = _u32(value + (value >> 11))
    elif remainder == 2:
        value = _u32(value + _get16(data, offset))
        value = _u32(value ^ (value << 11))
        value = _u32(value + (value >> 17))
    elif remainder == 1:
        value = _u32(value + _signed_byte(data[offset]))
        value = _u32(value ^ (value << 10))
        value = _u32(value + (value >> 1))

    value = _u32(value ^ (value << 3))
    value = _u32(value + (value >> 5))
    value = _u32(value ^ (value << 4))
    value = _u32(value + (value >> 17))
    value = _u32(value ^ (value << 25))
    value = _u32(value + (value >> 6))
    return value


def parse_po(path: Path) -> list[tuple[str, str]]:
    messages: list[tuple[str, str]] = []
    msgid: str | None = None
    msgstr: str | None = None
    field: str | None = None

    def finish() -> None:
        nonlocal msgid, msgstr, field
        if msgid is not None and msgstr:
            messages.append((msgid, msgstr))
        msgid = None
        msgstr = None
        field = None

    for line_number, raw_line in enumerate(
        path.read_text(encoding="utf-8").splitlines() + [""], start=1
    ):
        line = raw_line.strip()
        if line.startswith(("msgctxt ", "msgid_plural ", "msgstr[")):
            raise ValueError(
                f"{path}:{line_number}: context and plural entries are not supported"
            )
        if line.startswith("msgid "):
            if msgid is not None:
                finish()
            field = "msgid"
            msgid = ast.literal_eval(line[6:])
        elif line.startswith("msgstr "):
            field = "msgstr"
            msgstr = ast.literal_eval(line[7:])
        elif line.startswith('"'):
            value = ast.literal_eval(line)
            if field == "msgid":
                msgid = (msgid or "") + value
            elif field == "msgstr":
                msgstr = (msgstr or "") + value
        elif not line:
            finish()

    return messages


def compile_lmo(source: Path, destination: Path) -> int:
    values = bytearray()
    index: list[tuple[int, int, int, int]] = []

    for msgid, msgstr in parse_po(source):
        if not msgid:
            plural_formula = next(
                (
                    line.split(":", 1)[1].strip()
                    for line in msgstr.splitlines()
                    if line.lower().startswith("plural-forms:")
                ),
                "",
            )
            if plural_formula:
                value = plural_formula.encode("utf-8")
                offset = len(values)
                values.extend(value)
                values.extend(b"\0" * ((4 - len(value) % 4) % 4))
                index.append((0, 0, offset, len(value)))
            continue

        key = msgid.encode("utf-8")
        value = msgstr.encode("utf-8")
        key_id = sfh_hash(key)
        if key_id == sfh_hash(value):
            continue

        offset = len(values)
        values.extend(value)
        values.extend(b"\0" * ((4 - len(value) % 4) % 4))
        index.append((key_id, 1, offset, len(value)))

    if not index:
        raise ValueError(f"{source}: no translated messages")

    index.sort(key=lambda entry: entry[0])
    destination.parent.mkdir(parents=True, exist_ok=True)
    with destination.open("wb") as output:
        output.write(values)
        for entry in index:
            output.write(struct.pack(">IIII", *entry))
        output.write(struct.pack(">I", len(values)))

    return len(index)


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit(f"usage: {Path(sys.argv[0]).name} input.po output.lmo")

    source = Path(sys.argv[1])
    destination = Path(sys.argv[2])
    count = compile_lmo(source, destination)
    print(f"compiled {count} messages: {source} -> {destination}")


if __name__ == "__main__":
    main()
