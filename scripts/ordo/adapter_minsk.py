"""Minsk–Mahilioŭ DOCX adapter (Word paragraph styles first).

Style map observed in `Liturg_kal-r_2026 Мінск.docx`:

* `Dzien`              day heading "[+] D. Wd. – title"
* `Koler`              "<colour letter>\\t<Mass descriptor>"
* `Czytanni`           readings (sometimes also carries the Office line)
* `Uspamin`            "Або:/Альбо: Успамін …" — optional memorial
* `Liturgia-10-bold`,
  `swiatar`, None      Office line and day notes (clergy data lives here too)
* `Zagol-12-caps-bold` period / month / year headings (some day notes are
                       mis-styled with it, so content decides)
* `Zag11maly`          psalter week, lectionary volume, sub-headings
* `Osn-10`             period rules ("Каляндар.", "Імша.", "Літургія гадзінаў.")
* `ABJAVYBOLD`/`Abjavy` announcements for the coming week

Styles are hints: every paragraph is also checked by content.
"""

from __future__ import annotations

import datetime as dt
import re

from docx_reader import is_mostly_bold, read_paragraphs
from ordo_common import (
    MONTHS_NOMINATIVE, WEEKDAY_ABBR, clean_text, color_from_letter, colors_in,
    detect_rank, evidence, fold, is_reading_line, roman_to_int,
)
from ordo_records import Collector

FILE = "Liturg_kal-r_2026 Мінск.docx"
DAY_RE = re.compile(r"^\+?\s*(\d{1,2})\s*\.?\s*(?:(Пн|Ат|Аў|Ср|Чц|Пт|Сб|Нд)\s*\.?)?\s*[–—-]?\s*(.+)$")
MONTH_RE = re.compile(r"^(" + "|".join(MONTHS_NOMINATIVE) + r")(?:\s+(\d{4}))?$", re.I)
YEAR_RE = re.compile(r"^(\d{4})\s+ГОД$", re.I)
PSALTER_RE = re.compile(r"^Псалтыр\s+([IVІХ]+)\s+тыдня", re.I)
ALT_RE = re.compile(r"^(?:або|альбо|ці)\s*:\s*(.+)$", re.I)
PERIOD_HEADINGS = {
    "перыяд адвэнту": "advent", "перыяд нараджэння пана": "christmas", "вялікі пост": "lent",
    "велікодны перыяд": "easter", "звычайны перыяд": "ordinary", "святы пасхальны трыдуум": "triduum",
    "вялікі тыдзень": "holyweek",
}
COLOR_PREFIX = re.compile(r"^(Чр|Б|Ф|Ч|З|Р)(?:\t|\s{2,})(.*)$", re.S)
SUBPERIOD_RE = re.compile(r"^(?:першая|другая)\s+частка\s+|^велікодны\s+перыяд\s+пасля|^святы\s+пасхальны\s+трыдуум", re.I)


def paragraph_evidence(p: dict, raw: str | None = None) -> dict:
    return evidence(FILE, paragraph=p["index"], raw=raw if raw is not None else p["text"])


def extract(path: str) -> dict:
    col = Collector(diocese="minsk-mohilev", file=FILE, fmt="docx", adapter="minsk-paragraph-styles")
    paragraphs = read_paragraphs(path)
    year, month = 2025, 11
    last_day_number = 0
    record = None
    psalter = None
    section = None
    in_announcements = False
    pending_announcements: list[tuple[str, dict]] = []
    current_alt = None
    pending_alt = False

    def flush_announcements(anchor: str) -> None:
        for text, ev in pending_announcements:
            col.announcement(anchor, text, ev)
        pending_announcements.clear()

    for p in paragraphs:
        text = clean_text(p["text"])
        style = p["style"] or ""
        if not text:
            continue
        upper_key = fold(text).strip(" .:")

        # Year / month headings.
        if YEAR_RE.match(text):
            year = int(YEAR_RE.match(text).group(1))
            month = 0
            continue
        month_match = MONTH_RE.match(text.strip(" ."))
        if month_match and len(text) < 20:
            new_month = MONTHS_NOMINATIVE[fold(month_match.group(1))]
            if month_match.group(2):
                year = int(month_match.group(2))
            elif new_month < month:
                year += 1
            month = new_month
            last_day_number = 0
            continue

        # Period headings open a rules section.
        if upper_key in PERIOD_HEADINGS and (style.startswith("Zag") or is_mostly_bold(p) or text.isupper()):
            section = col.section(text, paragraph_evidence(p), scope_hint=PERIOD_HEADINGS[upper_key])
            record = None
            in_announcements = False
            continue
        if style == "Zag11malybold" or SUBPERIOD_RE.match(text):
            section = col.section(text, paragraph_evidence(p), scope_hint="period-phase")
            continue

        psalter_match = PSALTER_RE.match(text)
        if psalter_match:
            psalter = roman_to_int(psalter_match.group(1))
            continue
        if re.match(r"^(ЛЕКЦЫЯНАРЫЙ|ЛІТУРГІЯ ГАДЗІНАЎ)\s+[–-]\s+т\.", text, re.I) or re.match(r"^[IVXІ]+\s+ЗВЫЧАЙНЫ ТЫДЗЕНЬ$|^[IVXІ]+ тыдзень звычайнага перыяду$", text, re.I):
            if section is not None:
                col.add_section_item(section, text, paragraph_evidence(p))
            continue

        # Announcements ("Аб’явы:" + Abjavy paragraphs), anchored on the next Sunday.
        if style == "ABJAVYBOLD" or re.match(r"^Аб’явы\s*:?$", text):
            in_announcements = True
            continue
        if in_announcements and (style == "Abjavy" or (style in ("Zag11maly",) and record is None)):
            pending_announcements.append((text, paragraph_evidence(p)))
            continue

        day_match = DAY_RE.match(text) if (style == "Dzien" or re.match(r"^\+?\s*\d{1,2}\s*\.\s*(?:Пн|Ат|Ср|Чц|Пт|Сб|Нд)\.|^\+\s*\d{1,2}\.\s*[–—-]\s*\S", text)) else None
        if day_match:
            number = int(day_match.group(1))
            abbr = day_match.group(2)
            title = clean_text(day_match.group(3))
            if number < last_day_number - 15:
                month += 1
                if month == 13:
                    month, year = 1, year + 1
            try:
                date = dt.date(year, month, number)
            except ValueError:
                col.unresolve("invalid-day-number", text, paragraph_evidence(p))
                continue
            if abbr and WEEKDAY_ABBR.get(fold(abbr)) not in (None, date.isoweekday()):
                # Missing month heading: try the following month.
                nxt = dt.date(year + (month == 12), month % 12 + 1, number) if number <= 28 else None
                if nxt and WEEKDAY_ABBR.get(fold(abbr)) == nxt.isoweekday():
                    date, month, year = nxt, nxt.month, nxt.year
                else:
                    col.unresolve("weekday-mismatch", text, paragraph_evidence(p))
            last_day_number = number
            in_announcements = False
            section = None
            current_alt = None
            record = col.day(date, paragraph_evidence(p), {"weekday": abbr, "title": title, "sunday": text.startswith("+")})
            record["psalterWeek"] = psalter
            if pending_announcements:
                flush_announcements(date.isoformat())
            if fold(title) not in ("будзень",):
                col.add_celebration(record, title, detect_rank(title), "primary", paragraph_evidence(p))
            continue

        if record is None:
            if section is not None:
                col.add_section_item(section, text, paragraph_evidence(p))
            else:
                col.skip("front-matter", paragraph_evidence(p))
            continue

        ev = paragraph_evidence(p)
        if re.match(r"^(?:або|альбо)\s*:?$", text, re.I):
            pending_alt = True
            continue
        if pending_alt:
            pending_alt = False
            prefix = COLOR_PREFIX.match(p["text"].strip())
            title = clean_text(prefix.group(2)) if prefix else text
            current_alt = len(record["celebrations"])
            col.add_celebration(record, title, detect_rank(title, alternative=True), "alternative", ev,
                                color=color_from_letter(prefix.group(1)) if prefix else None)
            continue
        alt = ALT_RE.match(text)
        if (style == "Uspamin" and not is_reading_line(alt.group(1) if alt else text)) or (alt and detect_rank(alt.group(1), alternative=True) and not re.search(r"\d+\s*,\s*\d", alt.group(1))):
            title = alt.group(1) if alt else text
            current_alt = len(record["celebrations"])
            col.add_celebration(record, title, detect_rank(title, alternative=True), "alternative", ev)
            continue

        prefix = COLOR_PREFIX.match(p["text"].strip())
        if style == "Koler" or prefix:
            if prefix:
                letter, rest = prefix.group(1), prefix.group(2)
            else:
                letter, _, rest = p["text"].partition("\t")
            color = color_from_letter(letter)
            if color:
                if current_alt is None:
                    record["color"] = record["color"] or color
                    record["colors"].append(color)
                elif current_alt < len(record["celebrations"]):
                    record["celebrations"][current_alt]["color"] = color
            body = rest if color or not letter.strip() else p["text"]
            if body.strip():
                col.add_line(record, body, evidence(FILE, paragraph=p["index"], raw=p["text"]), hint="mass")
                if current_alt is not None and record["lines"]:
                    record["lines"][-1]["for"] = "alternative"
            continue

        col.add_line(record, text, ev)
        if current_alt is not None:
            target = record["readings"] if record["readings"] and record["readings"][-1]["evidence"] is ev else None
            if target:
                target[-1]["for"] = "alternative"
        # Explicit colour words inside notes (e.g. Laetare "ружовы") are kept as colour hints.
        if style in ("Koler",):
            record["colors"].extend(colors_in(text))

    return col.result()
