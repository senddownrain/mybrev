#!/usr/bin/env python3
"""
Parses all 27 NT books from catholic.by EPUBs and outputs
bible_seed_bel_nt.json.gz in BibleRepository format.
"""
import gzip
import io
import json
import re
import sys
import time
import urllib.request
import zipfile
from html.parser import HTMLParser

# ── Book catalogue ────────────────────────────────────────────────────────────
BOOKS = [
    ("mt",  "Евангелле паводле святога Мацвея",     40, "Evangelium_secundum_Matthaeum"),
    ("mk",  "Евангелле паводле святога Марка",       41, "Evangelium_secundum_Marcum"),
    ("lk",  "Евангелле паводле святога Лукі",        42, "Evangelium_secundum_Lucam"),
    ("jn",  "Евангелле паводле святога Яна",         43, "Evangelium_secundum_Ioannem"),
    ("acts","Дзеі Апосталаў",                        44, "Actus_Apostolorum"),
    ("rom", "Пасланне да Рымлянаў",                  45, "Epistula_ad_Romanos"),
    ("1co", "Першае пасланне да Карынцянаў",         46, "Epistula_I_ad_Corinthios"),
    ("2co", "Другое пасланне да Карынцянаў",         47, "Epistula_II_ad_Corinthios"),
    ("gal", "Пасланне да Галатаў",                   48, "Epistula_ad_Galatas"),
    ("eph", "Пасланне да Эфесцаў",                   49, "Epistula_ad_Ephesios"),
    ("php", "Пасланне да Філіпянаў",                 50, "Epistula_ad_Philippenses"),
    ("col", "Пасланне да Каласянаў",                 51, "Epistula_ad_Colossenses"),
    ("1th", "Першае пасланне да Тэсаланікійцаў",     52, "Epistula_I_Thessalonicenses"),
    ("2th", "Другое пасланне да Тэсаланікійцаў",     53, "Epistula_II_Thessalonicenses"),
    ("1ti", "Першае пасланне да Цімафея",             54, "Epistula_I_ad_Timotheum"),
    ("2ti", "Другое пасланне да Цімафея",             55, "Epistula_II_ad_Timotheum"),
    ("tit", "Пасланне да Ціта",                       56, "Epistula_ad_Titum"),
    ("phm", "Пасланне да Філімона",                   57, "Epistula_ad_Philemomem"),
    ("heb", "Пасланне да Габрэяў",                    58, "Epistula_ad_Hebraeos"),
    ("jas", "Пасланне святога Якуба",                 59, "Epistula_Iacobi"),
    ("1pe", "Першае пасланне святога Пятра",          60, "Epistula_I_Petri"),
    ("2pe", "Другое пасланне святога Пятра",          61, "Epistula_II_Petri"),
    ("1jn", "Першае пасланне святога Яна",            62, "Epistula_I_Ioannis"),
    ("2jn", "Другое пасланне святога Яна",            63, "Epistula_II_Ioannis"),
    ("3jn", "Трэцяе пасланне святога Яна",            64, "Epistula_III_Ioannis"),
    ("jud", "Пасланне святога Юды",                   65, "Epistula_Iudae"),
    ("rev", "Апакаліпсіс святога Яна",               66, "Apocalypsis_Ioannis"),
]

BASE = "https://catholic.by/3/images/files/doc/bible/"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Referer": "https://catholic.by/3/lib/bible",
}

# ── HTML parser ───────────────────────────────────────────────────────────────
# Approach: don't rely on CSS class names (they shift per book).
# Instead use structural signals:
#   <h1> with purely numeric text content → chapter number
#   <sup> with purely numeric text content → verse number
#   All other text nodes → append to current verse buffer
#
# We process the document linearly; any <h1> or numeric <sup>
# acts as a boundary, regardless of class names.

class EpubParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.chapters = []
        # Pre-initialize chapter so single-chapter books (no <h1>) work
        self._current_chapter = []
        self._current_verse_num = None
        self._current_verse_buf = []
        # tag stack
        self._tag_stack = []
        self._h1_buf = []
        self._in_h1 = False
        self._sup_depth = 0
        self._sup_buf = []
        # ignore script/style/title content
        self._ignore_depth = 0

    def _flush_verse(self):
        if self._current_verse_num is not None:
            text = " ".join("".join(self._current_verse_buf).split()).strip()
            if text:
                self._current_chapter.append(
                    {"num": self._current_verse_num, "text": text}
                )
            self._current_verse_buf = []

    def _new_chapter(self, num):
        self._flush_verse()
        if self._current_chapter:
            self.chapters.append(self._current_chapter)
        self._current_chapter = []
        self._current_verse_num = None
        self._current_verse_buf = []

    def handle_starttag(self, tag, attrs):
        self._tag_stack.append(tag)
        if tag in ("script", "style", "title", "head"):
            self._ignore_depth += 1
            return
        if tag == "h1":
            self._in_h1 = True
            self._h1_buf = []
        elif tag == "sup":
            self._sup_depth += 1
            self._sup_buf = []

    def handle_endtag(self, tag):
        if self._tag_stack and self._tag_stack[-1] == tag:
            self._tag_stack.pop()

        if tag in ("script", "style", "title", "head"):
            self._ignore_depth = max(0, self._ignore_depth - 1)
            return

        if tag == "h1":
            self._in_h1 = False
            raw = "".join(self._h1_buf).strip()
            if re.fullmatch(r"\d+", raw):
                self._new_chapter(int(raw))

        elif tag == "sup" and self._sup_depth > 0:
            self._sup_depth -= 1
            if self._sup_depth == 0:
                raw = "".join(self._sup_buf).strip()
                if re.fullmatch(r"\d+", raw):
                    self._flush_verse()
                    self._current_verse_num = int(raw)
                self._sup_buf = []

    def handle_data(self, data):
        if self._ignore_depth > 0:
            return
        if self._in_h1:
            self._h1_buf.append(data)
            return
        if self._sup_depth > 0:
            self._sup_buf.append(data)
            return
        # Only collect text when we have an active verse
        if self._current_verse_num is not None:
            # Skip if we're inside a heading tag
            if self._tag_stack and self._tag_stack[-1] in ("h1", "h2", "h3", "h4"):
                return
            self._current_verse_buf.append(data)

    def finalize(self):
        self._flush_verse()
        if self._current_chapter:
            self.chapters.append(self._current_chapter)


def download_epub(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read()


def find_content_html(zf):
    """Return (name, bytes) of the main content HTML in the EPUB."""
    names = zf.namelist()
    # Prefer the largest .html/.xhtml file (excluding titlepage/cover)
    candidates = [
        n for n in names
        if (n.endswith(".html") or n.endswith(".xhtml"))
        and "titlepage" not in n and "cover" not in n
    ]
    if not candidates:
        return None, None
    # Pick the largest
    best = max(candidates, key=lambda n: zf.getinfo(n).file_size)
    return best, zf.read(best)


def parse_epub(epub_bytes, book_id):
    zf = zipfile.ZipFile(io.BytesIO(epub_bytes))
    name, html_bytes = find_content_html(zf)
    if html_bytes is None:
        print(f"  [!] No content HTML found", file=sys.stderr)
        return []

    html = html_bytes.decode("utf-8", errors="replace")

    parser = EpubParser()
    parser.feed(html)
    parser.finalize()

    chapters = parser.chapters
    # Drop any empty chapters
    chapters = [ch for ch in chapters if ch]

    # Sanity: convert chapters to plain list-of-list format
    result = []
    for ch in chapters:
        result.append([{"num": v["num"], "text": v["text"]} for v in ch])

    return result


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    out_books = []
    total = len(BOOKS)

    for i, (book_id, name, order, filename) in enumerate(BOOKS, 1):
        url = f"{BASE}{filename}.epub"
        print(f"[{i:2d}/{total}] {name}", flush=True)

        try:
            epub_bytes = download_epub(url)
            chapters = parse_epub(epub_bytes, book_id)
            verse_count = sum(len(ch) for ch in chapters)
            print(f"         {len(chapters)} chapters, {verse_count} verses", flush=True)

            out_books.append({
                "id": book_id,
                "name": name,
                "order": order,
                "chapters": chapters,
            })
        except Exception as e:
            print(f"  [ERROR] {e}", file=sys.stderr)

        time.sleep(0.3)  # be polite

    data = {"books": out_books}

    # Write compressed JSON
    out_path = "scripts/bible/bible_seed_bel_nt.json.gz"
    json_bytes = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    with gzip.open(out_path, "wb", compresslevel=9) as f:
        f.write(json_bytes)

    total_books = len(out_books)
    total_chapters = sum(len(b["chapters"]) for b in out_books)
    total_verses = sum(len(ch) for b in out_books for ch in b["chapters"])
    size_kb = len(json_bytes) / 1024

    print(f"\nDone: {total_books} books, {total_chapters} chapters, {total_verses} verses")
    print(f"Raw JSON: {size_kb:.0f} KB → {out_path}")

    # Also write uncompressed for inspection
    with open("scripts/bible/bible_seed_bel_nt.json", "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print("Uncompressed JSON written for inspection.")


if __name__ == "__main__":
    main()
