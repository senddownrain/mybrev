#!/usr/bin/env python3
"""Run the four Ordo source adapters.

Usage: python3 scripts/ordo/extract.py [--sources DIR] [--out DIR] [diocese ...]

Reads the raw diocesan calendars from `.ordo-sources/` (never committed) and
writes one raw adapter JSON per diocese to `.ordo-sources/scratch/raw/`.
`scripts/ordo/build.mjs` turns those into the committed normalized evidence.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import adapter_grodno  # noqa: E402
import adapter_minsk  # noqa: E402
import adapter_pinsk  # noqa: E402
import adapter_vitebsk  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
ADAPTERS = {
    "minsk-mohilev": (adapter_minsk, "Liturg_kal-r_2026 Мінск.docx"),
    "vitebsk": (adapter_vitebsk, "Літургічны_каляндар_2025_2026_віцебск.docx"),
    "pinsk": (adapter_pinsk, "kl-2026_A-II пінск.pdf"),
    "grodno": (adapter_grodno, "каляндар 2027 Гродна.pdf"),
}


def find_source(directory: str, name: str) -> str:
    wanted = unicodedata.normalize("NFC", name)
    for entry in os.listdir(directory):
        if unicodedata.normalize("NFC", entry) == wanted:
            return os.path.join(directory, entry)
    raise FileNotFoundError(f"{name} not found in {directory}")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--sources", default=os.path.join(ROOT, ".ordo-sources"))
    parser.add_argument("--out", default=os.path.join(ROOT, ".ordo-sources", "scratch", "raw"))
    parser.add_argument("dioceses", nargs="*")
    args = parser.parse_args()
    os.makedirs(args.out, exist_ok=True)
    selected = args.dioceses or list(ADAPTERS)
    for diocese in selected:
        module, filename = ADAPTERS[diocese]
        path = find_source(args.sources, filename)
        result = module.extract(path)
        target = os.path.join(args.out, f"{diocese}.json")
        with open(target, "w", encoding="utf-8") as handle:
            json.dump(result, handle, ensure_ascii=False, indent=1, sort_keys=False)
        print(f"{diocese}: {len(result['days'])} days, {len(result['sections'])} sections, "
              f"{len(result['announcements'])} announcements, {len(result['excluded'])} excluded, "
              f"{len(result['unresolved'])} unresolved -> {os.path.relpath(target, ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
