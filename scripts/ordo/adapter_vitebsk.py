"""Vitebsk DOCX adapter — a state machine over unstyled paragraphs.

`Літургічны_каляндар_2025_2026_віцебск.docx` uses almost no paragraph
styles, so the adapter walks the document with explicit states:

FRONT      front matter; coloured bold headings open rule sections
           (precedence table, norms, Office order, penance days, movable
           feasts, the diocesan proper calendar)
CALENDAR   "D <month> – WEEKDAY – title" opens a day; inside a day:
             "<colour letter>\\t<readings>"     readings (+ day colour)
             "✠\\t<Mass/Office>"               descriptor, pro populo flag
             "<letter>\\tальбо: успамін …"      optional memorial
             blue text (4472C4/0070C0)          devotion/Ordo notes
             "+ кс. …"                          necrology (excluded)
           coloured headings inside the calendar are period/rubric sections
NECROLOGY  "Памерлыя святары …" — excluded wholesale
BLESSINGS  appendix of blessing rites; only the headings (rite + occasion)
           are kept, prayer texts are not Ordo data
"""

from __future__ import annotations

import datetime as dt
import re

from docx_reader import colors as run_colors, is_mostly_bold, read_paragraphs
from ordo_common import (
    MONTHS_GENITIVE, MONTHS_NOMINATIVE, WEEKDAYS, clean_text, color_from_letter,
    detect_rank, evidence, fold, roman_to_int,
)
from ordo_records import Collector

FILE = "Літургічны_каляндар_2025_2026_віцебск.docx"
HEADING_COLORS = {"4472C4", "7030A0", "00B050", "0070C0", "EE0000"}
DAY_RE = re.compile(r"^(\d{1,2})\s+(" + "|".join(MONTHS_GENITIVE) + r")\s*[–—-]\s*(.+)$", re.I)
MONTH_HEADING = re.compile(r"^(" + "|".join(MONTHS_NOMINATIVE) + r")\s+(\d{4})$", re.I)
PSALTER_RE = re.compile(r"^Псалтыр\s+([IVІХ]+)\s+тыдня", re.I)
LETTER_RE = re.compile(r"^(Чр|Б|Ф|Ч|З|Р|✠)?\s*\t\s*(.*)$", re.S)
ALT_RE = re.compile(r"^(?:альбо|або)\s*:\s*(.+)$", re.I)
WEEK_HEADING = re.compile(r"ТЫДЗЕНЬ|ТЫДНЯ\b", re.I)
PERIOD_KEYS = {
    "адвэнт": "advent", "нараджэння": "christmas", "звычайны перыяд": "ordinary",
    "вялікі пост": "lent", "вялікага посту": "lent", "вялікі тыдзень": "holyweek",
    "трыдуум": "triduum", "велікодны перыяд": "easter",
}


def scope_for(title: str) -> str | None:
    key = fold(title)
    if "уласны літургічны каляндар" in key:
        return "diocesan-proper"
    if "першынства" in key:
        return "precedence"
    for needle, value in PERIOD_KEYS.items():
        if needle in key:
            return value
    return None


def is_heading(p: dict) -> bool:
    text = clean_text(p["text"])
    if not text or not is_mostly_bold(p) or len(text) >= 160 or DAY_RE.match(text):
        return False
    if run_colors(p) & HEADING_COLORS:
        return True
    letters = re.sub(r"[^А-ЯЁІЎа-яёіўA-Za-z]", "", text)
    return len(letters) > 6 and letters.upper() == letters and not text.startswith("+")


def extract(path: str) -> dict:
    col = Collector(diocese="vitebsk", file=FILE, fmt="docx", adapter="vitebsk-state-machine")
    paragraphs = read_paragraphs(path)
    state = "FRONT"
    section = None
    record = None
    year, month = 2025, 11
    psalter = None
    current_alt = None
    blessing_heading: list[tuple[str, dict]] = []
    preview = False

    def ev_of(p: dict, raw: str | None = None) -> dict:
        return evidence(FILE, paragraph=p["index"], raw=raw if raw is not None else p["text"])

    def flush_blessing() -> None:
        if blessing_heading and section is not None:
            text = " ".join(t for t, _ in blessing_heading)
            col.add_section_item(section, text, blessing_heading[0][1])
        blessing_heading.clear()

    for p in paragraphs:
        text = clean_text(p["text"])
        if not text:
            continue
        key = fold(text)
        heading = is_heading(p)

        # --- state transitions -------------------------------------------
        if heading and key.startswith("памерлыя святары"):
            state = "NECROLOGY"
            record = None
            col._exclude("necrology", {"file": FILE, "paragraph": p["index"]})
            continue
        if heading and key.startswith("благаслаўленні"):
            state = "BLESSINGS"
            record = None
            section = col.section(text, ev_of(p), scope_hint="blessings-appendix")
            continue
        if heading and "збору ахвяраванняў" in key:
            state = "COLLECTIONS"
            record = None
            col._exclude("collection", {"file": FILE, "paragraph": p["index"]})
            continue
        if state == "COLLECTIONS":
            col._exclude("collection", {"file": FILE, "paragraph": p["index"]})
            continue
        if state == "NECROLOGY":
            col._exclude("necrology", {"file": FILE, "paragraph": p["index"]})
            continue
        if state == "BLESSINGS":
            if heading and not key.startswith("паводле"):
                blessing_heading.append((text, ev_of(p)))
            elif blessing_heading:
                flush_blessing()
            if key.startswith("пастырскае наведванне"):
                state = "END"
            continue
        if state == "END":
            col.skip("appendix", ev_of(p))
            continue

        if re.match(r"^ЛІТУРГІЧНЫ ГОД \d{4}\s*[–-]\s*\d{4}$", text):
            # Short preview of the next liturgical year (titles only).
            preview = True
            continue
        if preview and re.match(r"^(ЛІСТАПАД\s*-\s*СНЕЖАНЬ|АДВЭНТ)", text):
            continue
        month_heading = MONTH_HEADING.match(text)
        if month_heading:
            new_month = MONTHS_NOMINATIVE[fold(month_heading.group(1))]
            if preview and int(month_heading.group(2)) != year and new_month >= month:
                # "СНЕЖАНЬ 2027" after November 2026 is a typo in the source.
                col.unresolve("source-year-typo", text, ev_of(p))
            else:
                year = int(month_heading.group(2))
            month = new_month
            continue

        psalter_match = PSALTER_RE.match(text)
        if psalter_match:
            psalter = roman_to_int(psalter_match.group(1))
            continue

        day_match = DAY_RE.match(text) if is_mostly_bold(p) or state == "CALENDAR" else None
        if day_match and state == "FRONT" and fold(day_match.group(2)) == "лістапада" and "нядзеля" not in fold(text):
            day_match = None  # front-matter list of movable feasts
        if day_match:
            state = "CALENDAR"
            number = int(day_match.group(1))
            new_month = MONTHS_GENITIVE[fold(day_match.group(2))]
            if new_month < month and month - new_month > 6:
                year += 1
            month = new_month
            try:
                date = dt.date(year, month, number)
            except ValueError:
                col.unresolve("invalid-date", text, ev_of(p))
                continue
            parts = [clean_text(x) for x in re.split(r"\s+[–—-]\s+", day_match.group(3)) if clean_text(x)]
            weekday = None
            if parts and fold(parts[0]).split(" ")[0] in WEEKDAYS:
                weekday = parts[0]
                if fold(parts[0]) in WEEKDAYS:
                    parts = parts[1:]
            if weekday and WEEKDAYS.get(fold(weekday).split(" ")[0]) != date.isoweekday():
                col.unresolve("weekday-mismatch", text, ev_of(p))
            cycle = None
            if parts and re.match(r"^год\s+[ABCАВС]$", parts[-1], re.I):
                cycle = parts.pop()[-1]
            title = " – ".join(parts) if parts else (weekday or "")
            record = col.day(date, ev_of(p), {"weekday": weekday, "title": title, "sundayCycle": cycle})
            record["psalterWeek"] = psalter
            if preview and not record.get("duplicateHeaders"):
                record["preview"] = True
            current_alt = None
            section = None
            if title and not re.search(r"звычайны\s+дзень", fold(title)):
                col.add_celebration(record, title, detect_rank(title), "primary", ev_of(p))
            continue

        if heading:
            if state == "CALENDAR" and WEEK_HEADING.search(text) and not key.startswith("прадпіс"):
                # Week headings only carry the psalter/volume lines that follow.
                record = None
                section = None
                continue
            section = col.section(text, ev_of(p), scope_hint=scope_for(text))
            record = None
            continue

        if record is None:
            if section is not None:
                if section.get("scopeHint") == "diocesan-proper" and re.match(r"^(" + "|".join(MONTHS_NOMINATIVE) + r")$", key):
                    section.setdefault("month", MONTHS_NOMINATIVE[key])
                    section["items"].append({"text": text, "category": "month-marker", "tags": [], "evidence": ev_of(p)})
                    continue
                col.add_section_item(section, text, ev_of(p))
            elif state == "CALENDAR" and re.match(r"^Літургія\s+гадзінаў\s*:", text, re.I):
                continue  # breviary volume line under a week heading
            else:
                col.skip("front-matter" if state == "FRONT" else "outside-day", ev_of(p))
            continue

        # --- inside a day ----------------------------------------------------
        ev = ev_of(p)
        match = LETTER_RE.match(p["text"].strip("\n "))
        letter, body = (match.group(1), clean_text(match.group(2))) if match else (None, text)
        alt = ALT_RE.match(body)
        if alt and detect_rank(alt.group(1), alternative=True):
            current_alt = len(record["celebrations"])
            col.add_celebration(record, alt.group(1), detect_rank(alt.group(1), alternative=True), "alternative", ev,
                                color=color_from_letter(letter) if letter and letter != "✠" else None)
            continue
        if letter == "✠":
            record["proPopulo"] = True
        color = color_from_letter(letter) if letter and letter != "✠" else None
        if color and current_alt is None:
            record["color"] = record["color"] or color
            record["colors"].append(color)
        blue = bool(run_colors(p) & {"4472C4", "0070C0"})
        col.add_line(record, body, ev, hint="note" if blue else None)
        if current_alt is not None and record.get("_last") is not None:
            record["_last"]["for"] = "alternative"
        if blue and record.get("_last") is not None and record["_last"].get("text") == body:
            record["_last"]["sourceHighlight"] = "blue"

    flush_blessing()
    return col.result()
