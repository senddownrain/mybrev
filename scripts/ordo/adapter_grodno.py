"""Grodno PDF adapter — coordinate-aware day blocks, table zones, announcements.

`каляндар 2027 Гродна.pdf` is organised in five parts:

  I   (pp. 3–36)   front matter: precedence, customs, Mass tables, rubrics
  II  (pp. 37–143) calendar; each day is a block starting at its day number
                   (Times Bold 18pt, x≈62):
                     left  (x < 110): weekday, celebration, rank word,
                                      "колер X", readings, necrology "YYYY + Кс."
                     right (x ≥ 110): "Аф. …, Імша …", Vespers/Compline,
                                      "Псалтыр N тыдз.", notes; "Заўтра: …"
                                      lists tomorrow's local titular feasts
                   a full-width "Заўтра аб’явіць:" block with Wingdings "h"
                   bullets ("DD.MM -Wd- …") ends Saturday blocks
  III (pp. 144–169) proper readings of diocesan celebrations (headings only)
  IV  (pp. 170–186) blessing rites (headings name the occasion)
  V   (pp. 187–)    prayers (skipped)
"""

from __future__ import annotations

import datetime as dt
import re

from ordo_common import (
    ABBREVIATION_END,
    MONTHS_GENITIVE, MONTHS_NOMINATIVE, WEEKDAYS, WEEKDAY_ABBR, clean_text, colors_in, detect_rank,
    evidence, fold, join_hyphenated, roman_to_int,
)
from ordo_records import Collector
from pdf_lines import Line, build_lines, open_pdf, page_words, split_columns, union_bbox

FILE = "каляндар 2027 Гродна.pdf"
BOUNDARY = 110
CAL_FIRST, CAL_LAST = 38, 143
RIGHT_MARKERS = re.compile(
    r"^(?:Аф\.|Або:|Альбо:|І\s+Нешп|ІІ\s+Нешп|I\s+Нешп|II\s+Нешп|Псалтыр|Заўтра|Сёння|Імша|Св\.\s+Імша|Дазволена|Можа|Можна|"
    r"І\s+(?:чацвер|пятніца|субота|нядзеля)|I\s+(?:чацвер|пятніца|субота|нядзеля)|Лекцыянарый|Абрад|Благаслаўленне|Набажэнства|"
    r"Дзень|Сусветны|У\s+гэтым\s+годзе|Няма|Не\s|Пачатак|Заканчэнне|Працэсія|Навэнна|\d{4}\s*\+|[А-ЯЁІЎ][а-яёіў-]+-Катэдра:)"
)


def line_ev(lines: list[Line], raw: str | None = None) -> dict:
    return evidence(FILE, page=lines[0].page, bbox=union_bbox(lines),
                    raw=raw if raw is not None else " ".join(l.text for l in lines))


def paragraphs(lines: list[Line]) -> list[list[Line]]:
    groups: list[list[Line]] = []
    for line in lines:
        if not groups:
            groups.append([line])
            continue
        prev = groups[-1][-1]
        new = (RIGHT_MARKERS.match(line.text) and not prev.text.endswith(("-", ",")))
        new = new or (line.top - prev.bottom > 5) or abs(line.size - prev.size) > 0.8
        new = new or (prev.text.endswith(".") and not ABBREVIATION_END.search(prev.text) and not re.search(r"(?:Найсв|Бп|Пп|НПМ|Прэзб|Мм|Мч)\.$", prev.text) and re.match(r"^[А-ЯЁІЎA-Z«“]", line.text) and not re.match(r"^(?:НПМ|Бп|Ап|Мм|Мч|Пн|Прэзб|Д-рК|ЭМ)\b", line.text))
        if new:
            groups.append([line])
        else:
            groups[-1].append(line)
    return groups


def roman_date(text: str, year: int) -> dt.date | None:
    match = re.match(r"^(\d{1,2})\.([IVXІХ]+)\b", text)
    if not match:
        return None
    month = roman_to_int(match.group(1 + 1))
    try:
        return dt.date(year, month, int(match.group(1))) if month else None
    except ValueError:
        return None


def extract(path: str) -> dict:
    col = Collector(diocese="grodno", file=FILE, fmt="pdf", adapter="grodno-day-blocks")
    pdf = open_pdf(path)
    year, month = 2026, 12
    last_number = 0
    last_record = None
    section = None
    part = "I"

    for page_index, page in enumerate(pdf.pages):
        page_number = page_index + 1
        words = page_words(page)
        if not words:
            continue
        body = [w for w in words if w["top"] >= 22]
        header = " ".join(w["text"] for w in words if w["top"] < 22)
        lines = build_lines(body, page_number)
        head = " ".join(l.text for l in lines[:2]).upper()
        if "ІІІ ЧАСТКА" in head or "III ЧАСТКА" in head:
            part = "III"
            section = col.section("ЛІТУРГІЯ БОЖАГА СЛОВА (уласныя чытанні)", line_ev(lines[:2]), scope_hint="diocesan-lectionary")
        elif "ІV ЧАСТКА" in head or "IV ЧАСТКА" in head:
            part = "IV"
            section = col.section("САКРАМЭНТАЛІІ І БЛАГАСЛАЎЛЕННІ", line_ev(lines[:2]), scope_hint="blessings-appendix")
        elif re.search(r"\bV ЧАСТКА", head):
            part = "V"
        elif page_number >= CAL_FIRST and page_number <= CAL_LAST:
            part = "II"

        if page_number <= 4 or part == "V" or page_number in (6, 7, 8) or 9 <= page_number <= 13 and "ТАБЛІЦА" not in head:
            col.skip("front-matter" if part != "V" else "prayers-appendix", {"file": FILE, "page": page_number})
            continue

        if part in ("III", "IV"):
            # Only headings: bold, centred lines (III) or bold 10pt titles (IV).
            heading: list[Line] = []
            for line in lines:
                is_head = line.bold and (line.x0 > 70 if part == "III" else line.size >= 10) and not re.match(r"^(?:ПЕРШАЕ|ДРУГОЕ|РЭСПАНСАРЫЙНЫ|СПЕЎ|ЕВАНГЕЛЛЕ|Гэта|\+|Чытанне|ІІІ ЧАСТКА|ІV ЧАСТКА|ЛІТУРГІЯ БОЖАГА|САКРАМЭНТАЛІІ)", line.text)
                if is_head:
                    heading.append(line)
                elif heading:
                    col.add_section_item(section, join_hyphenated([l.text for l in heading]), line_ev(heading))
                    heading = []
            if heading:
                col.add_section_item(section, join_hyphenated([l.text for l in heading]), line_ev(heading))
            continue

        if part == "I":
            if "ЗБОР" in head and "АХВЯРАВАНН" in head:
                col._exclude("collection", {"file": FILE, "page": page_number})
                continue
            titles = [l for l in lines[:3] if l.bold and re.sub(r"[^А-ЯЁІЎ]", "", l.text) and len(l.text) > 5]
            items: list[list[Line]] = []
            for line in lines:
                if line in titles:
                    if items or section is None:
                        pass
                    section = col.section(line.text, line_ev([line]), scope_hint="front")
                    items = []
                    continue
                if section is None:
                    section = col.section(f"page {page_number}", line_ev([line]), scope_hint="front")
                starts = line.x0 > 33 or re.match(r"^(?:\d+\.|[а-г]\)|•|-)\s", line.text)
                if starts or not items:
                    if items:
                        text = join_hyphenated([l.text for l in items[-1]])
                        col.add_section_item(section, text, line_ev(items[-1], text))
                    items = [[line]]
                else:
                    items[-1].append(line)
            if items:
                text = join_hyphenated([l.text for l in items[-1]])
                col.add_section_item(section, text, line_ev(items[-1], text))
            continue

        # --- part II: calendar -----------------------------------------------
        header_months = [MONTHS_NOMINATIVE[fold(t)] for t in re.findall(r"[А-ЯЁІЎа-яёіў]+", header) if fold(t) in MONTHS_NOMINATIVE]
        numbers = sorted([w for w in body if w["text"].isdigit() and w["size"] >= 15 and w["x0"] < BOUNDARY], key=lambda w: w["top"])
        if not numbers:
            col.skip("calendar-page-without-days", {"file": FILE, "page": page_number})
            continue
        left_words, right_words = split_columns(body, BOUNDARY)
        # The announcement block and the necrology use the left margin too;
        # find the "Заўтра аб’явіць:" start first.
        all_left = build_lines(left_words, page_number)
        announce = next((l for l in build_lines(body, page_number) if re.match(r"^Заўтра\s+аб’явіць", l.text)), None)
        cutoff = announce.top if announce else 10_000

        for index, number in enumerate(numbers):
            day_number = int(number["text"])
            top = number["top"] - 6
            bottom = numbers[index + 1]["top"] - 6 if index + 1 < len(numbers) else cutoff
            bottom = min(bottom, cutoff)
            if day_number < last_number - 20:
                month = month % 12 + 1
                if month == 1:
                    year += 1
            elif last_number == 0 and header_months:
                month = header_months[0]
            last_number = day_number
            try:
                date = dt.date(year, month, day_number)
            except ValueError:
                col.unresolve("invalid-date", str(day_number), evidence(FILE, page=page_number, raw=str(day_number)))
                continue
            left = [l for l in all_left if top <= l.top < bottom and number not in l.words]
            left = [Line(l.page, [w for w in l.words if w is not number]) for l in left]
            left = [l for l in left if l.words]
            right = build_lines([w for w in right_words if top <= w["top"] < bottom], page_number)
            ev = evidence(FILE, page=page_number, bbox=[number["x0"], top, page.width, min(bottom, page.height)],
                          raw=" ".join(l.text for l in left[:5]))

            weekday = None
            title_lines: list[Line] = []
            readings: list[Line] = []
            necrology: list[Line] = []
            color = None
            for line in left:
                text = line.text
                if re.match(r"^\d{4}\s*\+", text):
                    necrology.append(line)
                    continue
                if weekday is None and fold(text) in WEEKDAYS:
                    weekday = text
                    continue
                if text.startswith("колер"):
                    color = text
                    continue
                if color is None:
                    title_lines.append(line)
                else:
                    readings.append(line)
            for line in necrology:
                col.filter_text(line.text, line_ev([line]))
            if weekday and WEEKDAYS[fold(weekday)] != date.isoweekday():
                shifted = next((date + dt.timedelta(days=k) for k in (-1, 1) if (date + dt.timedelta(days=k)).isoweekday() == WEEKDAYS[fold(weekday)]), None)
                if shifted and shifted.isoformat() not in col.days:
                    # The printed day number is off by one; the weekday and
                    # the celebration agree with the corrected date.
                    col.unresolve("source-day-number-typo", f"{day_number} {weekday} -> {shifted.isoformat()}", ev)
                    date = shifted
                else:
                    col.unresolve("weekday-mismatch", f"{day_number} {weekday}", ev)
            title = join_hyphenated([l.text for l in title_lines])
            record = col.day(date, ev, {"weekday": weekday, "title": title})
            last_record = record
            if color:
                record["colors"].extend(colors_in(color))
                record["colorText"] = color
            if title:
                col.add_celebration(record, title, detect_rank(title), "primary", line_ev(title_lines, title))
            if readings:
                col.add_line(record, join_hyphenated([l.text for l in readings]), line_ev(readings), hint="reading")

            for group in paragraphs(right):
                text = join_hyphenated([l.text for l in group])
                gev = line_ev(group, text)
                psalter = re.match(r"^Псалтыр\s+([IVІ]+)\s+тыдз", text)
                if psalter:
                    record["psalterWeek"] = roman_to_int(psalter.group(1))
                    continue
                tomorrow = re.match(r"^Заўтра\s*:\s*(.+)$", text)
                if tomorrow:
                    target = (date + dt.timedelta(days=1)).isoformat()
                    record.setdefault("tomorrowLocal", []).append({"text": col.filter_text(tomorrow.group(1), gev), "targetDate": target, "evidence": gev})
                    continue
                alt = re.match(r"^(?:Або|Альбо)\s*:\s*(.+)$", text)
                if alt and detect_rank(alt.group(1), alternative=True):
                    head_text = re.split(r"\.\s+(?=Аф\.|Св\.\s+Імша|Імша)", alt.group(1), maxsplit=1)
                    col.add_celebration(record, head_text[0], detect_rank(head_text[0], alternative=True), "alternative", gev,
                                        color=(colors_in(text) or [None])[-1])
                    if len(head_text) > 1:
                        col.add_line(record, head_text[1], gev, hint="mass")
                        if record.get("_last") is not None:
                            record["_last"]["for"] = "alternative"
                    continue
                col.add_line(record, text, gev, hint="note")

        if announce is not None and last_record is not None:
            anchor = dt.date.fromisoformat(last_record["date"])
            block = [l for l in build_lines(body, page_number) if l.top > announce.top + 2]
            items: list[list[Line]] = []
            for line in block:
                bullet = any(w["fontname"].endswith("Wingdings3") for w in line.words)
                text_words = [w for w in line.words if not w["fontname"].endswith("Wingdings3")]
                if not text_words:
                    if items is not None:
                        items.append([])
                    continue
                clean = Line(line.page, text_words)
                if (bullet or not items) or not items[-1] and False:
                    items.append([clean])
                elif items and not items[-1]:
                    items[-1].append(clean)
                elif re.match(r"^\d{1,2}\.[IVXІХ]+\s+-", clean.text) or re.match(r"^Сёння\b", clean.text):
                    items.append([clean])
                else:
                    items[-1].append(clean)
            for group in [g for g in items if g]:
                text = join_hyphenated([l.text for l in group])
                target = roman_date(text, anchor.year)
                if target and target < anchor - dt.timedelta(days=200):
                    target = roman_date(text, anchor.year + 1)
                if text.startswith("Сёння"):
                    target = anchor
                col.announcement(anchor.isoformat(), re.sub(r"^\d{1,2}\.[IVXІХ]+\s+-[А-Яа-яЎўІі]+-\s*", "", text), line_ev(group, text),
                                 target=target.isoformat() if target else None)
    return col.result()
