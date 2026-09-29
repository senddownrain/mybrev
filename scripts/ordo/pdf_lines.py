"""Coordinate-aware line building for the PDF adapters (pdfplumber)."""

from __future__ import annotations

import re
from dataclasses import dataclass, field

import pdfplumber

from ordo_common import clean_text


@dataclass
class Line:
    page: int
    words: list[dict] = field(default_factory=list)

    @property
    def text(self) -> str:
        value = clean_text(" ".join(w["text"] for w in self.words))
        # Keep a trailing soft hyphen so join_hyphenated() can glue the word.
        return value + "\u00ad" if self.words and self.words[-1]["text"].endswith("\u00ad") else value

    @property
    def x0(self) -> float:
        return min(w["x0"] for w in self.words)

    @property
    def x1(self) -> float:
        return max(w["x1"] for w in self.words)

    @property
    def top(self) -> float:
        return min(w["top"] for w in self.words)

    @property
    def bottom(self) -> float:
        return max(w["bottom"] for w in self.words)

    @property
    def size(self) -> float:
        sizes = sorted(round(w["size"], 1) for w in self.words)
        return sizes[len(sizes) // 2]

    @property
    def bold(self) -> bool:
        chars = sum(len(w["text"]) for w in self.words)
        bold = sum(len(w["text"]) for w in self.words if "Bold" in w["fontname"])
        return chars > 0 and bold / chars > 0.6

    @property
    def italic(self) -> bool:
        chars = sum(len(w["text"]) for w in self.words)
        italic = sum(len(w["text"]) for w in self.words if re.search(r"It(alic)?\b|-It|Italic", w["fontname"]))
        return chars > 0 and italic / chars > 0.6

    @property
    def bbox(self) -> list[float]:
        return [self.x0, self.top, self.x1, self.bottom]


def page_words(page) -> list[dict]:
    # extra_attrs splits words on font/size changes ("19Імша:" -> "19", "Імша:").
    return page.extract_words(extra_attrs=["fontname", "size"], keep_blank_chars=False, x_tolerance=1.5)


def build_lines(words: list[dict], page_number: int, *, tolerance: float = 2.5) -> list[Line]:
    lines: list[Line] = []
    for word in sorted(words, key=lambda w: (round(w["top"], 1), w["x0"])):
        for line in reversed(lines[-4:]):
            if abs(line.top - word["top"]) <= tolerance or abs(line.bottom - word["bottom"]) <= tolerance:
                line.words.append(word)
                break
        else:
            lines.append(Line(page_number, [word]))
    for line in lines:
        line.words.sort(key=lambda w: w["x0"])
    return sorted(lines, key=lambda l: (l.top, l.x0))


def split_columns(words: list[dict], boundary: float) -> tuple[list[dict], list[dict]]:
    left = [w for w in words if w["x0"] < boundary - 1]
    right = [w for w in words if w["x0"] >= boundary - 1]
    return left, right


def open_pdf(path: str):
    return pdfplumber.open(path)


def union_bbox(lines: list[Line]) -> list[float]:
    return [min(l.x0 for l in lines), min(l.top for l in lines), max(l.x1 for l in lines), max(l.bottom for l in lines)]
