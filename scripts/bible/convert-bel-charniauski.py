#!/usr/bin/env python3
"""
Scrapes the full Belarusian Bible — Пераклад Уладзіслава Чарняўскага 2017
(edition corrected by the Bible Society in Belarus) — from bible.by and
outputs bible_seed_bel_charniauski.json.gz in BibleRepository format.

Source: https://bible.by/bvc-2017/{book}/{chapter}/
Canon: 73 books (39 OT + 7 deuterocanonical + 27 NT), ordered like the
Russian seed (bible_seed_ru.json.gz) so the two languages stay aligned.

Usage:
  python3 scripts/bible/convert-bel-charniauski.py            # fresh scrape
  python3 scripts/bible/convert-bel-charniauski.py --resume   # reuse scraped cache
"""

import gzip
import html as html_mod
import json
import re
import sys
import time
import urllib.request
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent
OUT_JSON = SCRIPT_DIR / "bible_seed_bel_charniauski.json.gz"
CACHE_DIR = SCRIPT_DIR / ".cache_bel_charniauski"
DELAY = 0.3  # polite delay between requests, seconds

# bible.by book number → (our id, Belarusian name).
# bible.by numbering: OT 1–39, NT 40–66, deuterocanon 67/68/70/73/75/76/77.
BIBLE_BY = {
    1: ("gn", "Роду"),
    2: ("ex", "Выхад"),
    3: ("lv", "Святарская"),
    4: ("nm", "Лічбаў"),
    5: ("dt", "Паўтор Закону"),
    6: ("js", "Ешуа"),
    7: ("jdg", "Суддзяў"),
    8: ("rt", "Рут"),
    9: ("1sm", "1 Самуэля"),
    10: ("2sm", "2 Самуэля"),
    11: ("1kgs", "1 Цароў"),
    12: ("2kgs", "2 Цароў"),
    13: ("1ch", "1 Хронікаў"),
    14: ("2ch", "2 Хронікаў"),
    15: ("ezr", "Эздры"),
    16: ("ne", "Нэгэміі"),
    17: ("et", "Эстэр"),
    18: ("job", "Ёва"),
    19: ("ps", "Псальмаў"),
    20: ("prv", "Выслоўяў"),
    21: ("ec", "Эклезіяста"),
    22: ("so", "Песня з Песняў"),
    23: ("is", "Ісаі"),
    24: ("jr", "Ярэміі"),
    25: ("lm", "Ламентацыі"),
    26: ("ez", "Эзэкіэля"),
    27: ("dn", "Даніэля"),
    28: ("ho", "Осіі"),
    29: ("jl", "Ёэля"),
    30: ("am", "Амоса"),
    31: ("ob", "Абдыі"),
    32: ("jon", "Ёны"),
    33: ("mi", "Міхея"),
    34: ("na", "Навума"),
    35: ("hk", "Абакука"),
    36: ("zp", "Сафоніі"),
    37: ("hg", "Агэя"),
    38: ("zc", "Захарыі"),
    39: ("ml", "Малахіі"),
    67: ("1mac", "1 Макабэяў"),
    68: ("2mac", "2 Макабэяў"),
    70: ("bar", "Баруха"),
    73: ("jdt", "Юдыт"),
    75: ("wis", "Мудрасці"),
    76: ("sir", "Эклезіясціка"),
    77: ("tob", "Тобіі"),
    40: ("mt", "Мацвея"),
    41: ("mk", "Марка"),
    42: ("lk", "Лукі"),
    43: ("jn", "Яна"),
    44: ("acts", "Дзеі"),
    45: ("jas", "Якуба"),
    46: ("1pe", "1 Пятра"),
    47: ("2pe", "2 Пятра"),
    48: ("1jn", "1 Яна"),
    49: ("2jn", "2 Яна"),
    50: ("3jn", "3 Яна"),
    51: ("jud", "Юды"),
    52: ("rom", "Да Рымлянаў"),
    53: ("1co", "1 да Карынцянаў"),
    54: ("2co", "2 да Карынцянаў"),
    55: ("gal", "Да Галатаў"),
    56: ("eph", "Да Эфесцаў"),
    57: ("php", "Да Піліпцаў"),
    58: ("col", "Да Калосцаў"),
    59: ("1th", "1 да Тэсалонцаў"),
    60: ("2th", "2 да Тэсалонцаў"),
    61: ("1ti", "1 да Цімафея"),
    62: ("2ti", "2 да Цімафея"),
    63: ("tit", "Да Ціта"),
    64: ("phm", "Да Філімона"),
    65: ("heb", "Да Габраяў"),
    66: ("rev", "Адкрыццё"),
}

BASE = "https://bible.by/bvc-2017"
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Referer": "https://bible.by/bvc-2017/",
}

# Output order — catholic canon, matching bible_seed_ru.json.gz
CANON_ORDER = [
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
    77, 73, 17, 67, 68,
    18, 19, 20, 21, 22, 75, 76,
    23, 24, 25, 70, 26, 27,
    28, 29, 30, 31, 32, 33, 34, 35, 36, 37, 38, 39,
    40, 41, 42, 43, 44, 52, 53, 54, 55, 56, 57, 58, 59, 60,
    61, 62, 63, 64, 65, 45, 46, 47, 48, 49, 50, 51, 66,
]

VERSE_RE = re.compile(r'<div id="(\d+)"><sup>\d+</sup>(.*?)</div>', re.S)
TAG_RE = re.compile(r"<[^>]+>")
WS_RE = re.compile(r"\s+")


def fetch(path: str) -> str:
    url = BASE + path
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = resp.read().decode("utf-8")
    time.sleep(DELAY)
    return data


def clean(text: str) -> str:
    text = TAG_RE.sub("", text)
    text = html_mod.unescape(text)
    return WS_RE.sub(" ", text).strip()


def chapter_count(book_num: int, first_page: str) -> int:
    links = re.findall(rf'href="/bvc-2017/{book_num}/(\d+)/"', first_page)
    nums = [int(n) for n in links]
    return max(nums) if nums else 1


def parse_chapter(html: str) -> list[str]:
    verses = VERSE_RE.findall(html)
    verses.sort(key=lambda v: int(v[0]))
    return [clean(v[1]) for v in verses]


def main() -> None:
    resume = "--resume" in sys.argv
    CACHE_DIR.mkdir(exist_ok=True)

    books_out = []
    total_verses = 0
    for order, num in enumerate(CANON_ORDER, start=1):
        book_id, name = BIBLE_BY[num]
        cache_file = CACHE_DIR / f"{num:02d}.json"
        if resume and cache_file.exists():
            chapters = json.loads(cache_file.read_text(encoding="utf-8"))
        else:
            first = fetch(f"/{num}/1/")
            n_chapters = chapter_count(num, first)
            chapters = [parse_chapter(first)]
            for c in range(2, n_chapters + 1):
                chapters.append(parse_chapter(fetch(f"/{num}/{c}/")))
            empty = [
                i + 1 for i, ch in enumerate(chapters) if not ch
            ]
            if empty:
                print(f"  WARNING {book_id}: empty chapters {empty}", flush=True)
            cache_file.write_text(
                json.dumps(chapters, ensure_ascii=False), encoding="utf-8"
            )
        n_verses = sum(len(ch) for ch in chapters)
        total_verses += n_verses
        print(f"{order:2d}. {book_id:<6} {name} — {len(chapters)} chapters, "
              f"{n_verses} verses", flush=True)
        books_out.append(
            {"id": book_id, "name": name, "order": order, "chapters": chapters}
        )

    with gzip.open(OUT_JSON, "wt", encoding="utf-8") as f:
        json.dump({"books": books_out}, f, ensure_ascii=False)

    print(f"\nDone: {len(books_out)} books, {total_verses} verses → {OUT_JSON}")


if __name__ == "__main__":
    main()
