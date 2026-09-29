"""Minimal OOXML paragraph reader (no python-docx dependency)."""

from __future__ import annotations

import zipfile
from xml.etree import ElementTree as ET

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"


def _flag(rpr, name: str) -> bool:
    if rpr is None:
        return False
    node = rpr.find(W + name)
    return node is not None and node.get(W + "val") not in ("0", "false")


def _runs(paragraph) -> list[dict]:
    runs = []
    for run in paragraph.iter(W + "r"):
        rpr = run.find(W + "rPr")
        parts = []
        for node in run:
            if node.tag == W + "t":
                parts.append(node.text or "")
            elif node.tag == W + "tab":
                parts.append("\t")
            elif node.tag in (W + "br", W + "cr"):
                parts.append("\n")
        text = "".join(parts)
        if not text:
            continue
        color = None
        if rpr is not None and rpr.find(W + "color") is not None:
            value = rpr.find(W + "color").get(W + "val")
            color = None if value in (None, "000000", "auto") else value
        runs.append({
            "text": text,
            "bold": _flag(rpr, "b"),
            "italic": _flag(rpr, "i"),
            "color": color,
        })
    return runs


def read_paragraphs(path: str) -> list[dict]:
    """Return body paragraphs (tables flattened row by row) with formatting."""
    with zipfile.ZipFile(path) as archive:
        root = ET.fromstring(archive.read("word/document.xml"))
    body = root.find(W + "body")
    result = []
    index = 0
    for element in body:
        if element.tag == W + "p":
            style = element.find(f"{W}pPr/{W}pStyle")
            runs = _runs(element)
            result.append({
                "index": index,
                "style": style.get(W + "val") if style is not None else None,
                "runs": runs,
                "text": "".join(r["text"] for r in runs),
                "table": False,
            })
            index += 1
        elif element.tag == W + "tbl":
            for row in element.iter(W + "tr"):
                cells = []
                for cell in row.iter(W + "tc"):
                    cells.append(" ".join("".join(r["text"] for r in _runs(p)) for p in cell.iter(W + "p")))
                result.append({"index": index, "style": "table-row", "runs": [], "text": " | ".join(cells), "table": True})
            index += 1
    return result


def bold_text(paragraph: dict) -> str:
    return "".join(r["text"] for r in paragraph["runs"] if r["bold"])


def is_mostly_bold(paragraph: dict) -> bool:
    total = sum(len(r["text"].strip()) for r in paragraph["runs"])
    bold = sum(len(r["text"].strip()) for r in paragraph["runs"] if r["bold"])
    return total > 0 and bold / total > 0.6


def colors(paragraph: dict) -> set[str]:
    return {r["color"] for r in paragraph["runs"] if r["color"] and r["text"].strip()}
