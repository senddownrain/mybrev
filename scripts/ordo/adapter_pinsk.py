"""Pinsk PDF adapter — coordinate-aware day bands and two columns.

Calendar pages of `kl-2026_A-II пінск.pdf` hold up to four days. Each day is
a horizontal *band* starting at its day number (MinionPro-Bold 20pt):

  left column  (x < ~140): weekday, celebration (bold), "(колер)", readings
  right column (x ≥ ~140): "Імша: …", "ЛГ: …", "Або:/Дазволена: …",
                           notes (11.5pt), necrology "† Кс. …"

Saturday pages end with a full-width "Аб’явы." block (weekly announcements,
continuing on following pages until the next day band). Pages without day
numbers are period instruction pages ("ЛІТУРГІЧНЫЯ ЎКАЗАННІ", "•" bullets)
or front matter. Collections and the clergy contact directory are skipped.
"""

from __future__ import annotations

import datetime as dt
import re

from ordo_common import (
    ABBREVIATION_END,
    MONTHS_GENITIVE, MONTHS_NOMINATIVE, WEEKDAYS, clean_text, colors_in, detect_rank,
    evidence, fold, join_hyphenated,
)
from ordo_records import Collector
from pdf_lines import Line, build_lines, open_pdf, page_words, split_columns, union_bbox

FILE = "kl-2026_A-II пінск.pdf"
BOUNDARY = 140
RIGHT_MARKERS = re.compile(
    r"^(?:Імша:|ЛГ:|Або:|Альбо:|Дазволена:|Наб\.|Набажэнства|І\s+Нешпары|ІІ\s+Нешпары|Нешпары|†|Імяніны|Урач\.|Урачыстасць|"
    r"Увечары|Пачатак|Сёння|Благаслаўленне|ЗЖІ|ЗУІП|Песні|Дзень|Тыдзень|Заканчэнне|Першы|Першая|І\s+(?:чацвер|пятніца|субота|нядзеля)|"
    r"Малітв|Працэсія|Адпуст|Поўны|Камплета|Гадзіна|Не\s|Няма|Можна|Нагадаць|Заахвоціць|Аб’явіць|Сусветны|Міжнародны|Навэнна|\d+\s*[-–]\s*ы?\s*дзень)"
)
FRONT_SKIP = {
    "СКАРАЧЭННІ": "abbreviations", "СКАРАЧЭННI": "abbreviations", "ЗБОРЫ АХВЯРАВАННЯЎ": "collections",
    "КАНТАКТЫ": "contacts", "ЗМЕСТ": "contents", "СКАРАЧЭННІ НАЗВАЎ": "abbreviations",
}


def line_ev(lines: list[Line], raw: str | None = None) -> dict:
    return evidence(FILE, page=lines[0].page, bbox=union_bbox(lines),
                    raw=raw if raw is not None else " ".join(l.text for l in lines))


def paragraphs(lines: list[Line]) -> list[list[Line]]:
    """Group right-column visual lines into logical paragraphs."""
    groups: list[list[Line]] = []
    for line in lines:
        text = line.text
        if not groups:
            groups.append([line])
            continue
        prev = groups[-1][-1]
        gap = line.top - prev.bottom
        starts_new = bool(RIGHT_MARKERS.match(text)) and not prev.text.endswith(("-", "–", ","))
        ended = prev.text.endswith((".", ":", ";")) and not ABBREVIATION_END.search(prev.text) and not re.search(r"(?:Найсв|Бп|Пп|дК|Пн|Аб|НПМ)\.$", prev.text) and re.match(r"^[А-ЯЁІЎA-Z«“(†+0-9]", text)
        size_change = abs(line.size - prev.size) > 0.8
        if starts_new or gap > 5 or size_change or (ended and not re.match(r"^\(?РІ|^\d", text)):
            groups.append([line])
        else:
            groups[-1].append(line)
    return groups


def spanning_lines(words: list[dict], page_number: int) -> list[Line]:
    """Lines whose words run continuously across the column boundary."""
    result = []
    for line in build_lines(words, page_number):
        ordered = line.words
        for a, b in zip(ordered, ordered[1:]):
            if a["x1"] <= BOUNDARY + 2 and b["x0"] >= BOUNDARY - 2 and b["x0"] - a["x1"] < 7 and line.x1 - line.x0 > 200:
                result.append(line)
                break
    return result


def page_month(words: list[dict]) -> tuple[int | None, int | None]:
    header = " ".join(w["text"] for w in words if w["top"] < 26)
    month = year = None
    for token in re.findall(r"[А-ЯЁІЎа-яёіў]+", header):
        value = MONTHS_NOMINATIVE.get(fold(token))
        if value:
            month = value
    match = re.search(r"(20\d\d)", header)
    if match:
        year = int(match.group(1))
    return month, year


def extract(path: str) -> dict:
    col = Collector(diocese="pinsk", file=FILE, fmt="pdf", adapter="pinsk-day-bands")
    pdf = open_pdf(path)
    year, month = 2025, 12
    last_number = 0
    section = None
    announce_anchor = None
    announce_mode = False
    pending_announcement: list[Line] = []
    last_record = None

    def flush_announcement():
        nonlocal pending_announcement
        if not pending_announcement:
            return
        # Split numbered points and "– у сераду, 31 снежня, — …" sub-points.
        items: list[list[Line]] = []
        for line in pending_announcement:
            text = line.text
            if re.match(r"^(?:\d+\.|–|—|-)\s", text) or not items:
                items.append([line])
            else:
                items[-1].append(line)
        nonlocal announce_anchor
        for group in items:
            today = re.match(r"^(?:\d+\.\s*)?Сёння,?\s+(\d{1,2})\s+(" + "|".join(MONTHS_GENITIVE) + r")", join_hyphenated([l.text for l in group]))
            if today and announce_anchor:
                ref = dt.date.fromisoformat(announce_anchor)
                m = MONTHS_GENITIVE[fold(today.group(2))]
                y = ref.year + (1 if m < ref.month - 6 else 0) - (1 if m > ref.month + 6 else 0)
                announce_anchor = dt.date(y, m, int(today.group(1))).isoformat()
                break
        for group in items:
            text = join_hyphenated([l.text for l in group])
            if re.match(r"^Аб’явы", text):
                continue
            target = None
            date_match = re.search(r"(\d{1,2})\s+(" + "|".join(MONTHS_GENITIVE) + r")", text)
            if date_match and announce_anchor:
                anchor = dt.date.fromisoformat(announce_anchor)
                m = MONTHS_GENITIVE[fold(date_match.group(2))]
                y = anchor.year + (1 if m < anchor.month - 6 else 0) - (1 if m > anchor.month + 6 else 0)
                try:
                    target = dt.date(y, m, int(date_match.group(1))).isoformat()
                except ValueError:
                    target = None
            col.announcement(announce_anchor, text, line_ev(group, text), target=target)
        pending_announcement = []

    for page_index, page in enumerate(pdf.pages):
        page_number = page_index + 1
        words = page_words(page)
        if not words:
            continue
        body_words = [w for w in words if w["top"] >= 26]
        numbers = sorted(
            [w for w in body_words if w["text"].isdigit() and w["size"] >= 17 and w["x0"] < BOUNDARY],
            key=lambda w: w["top"],
        )
        all_lines = build_lines(body_words, page_number)
        first_text = " ".join(l.text for l in all_lines[:3]).upper()

        # --- front matter / skipped pages --------------------------------
        skip_reason = next((reason for key, reason in FRONT_SKIP.items() if first_text.startswith(key)), None)
        if skip_reason or (section is not None and section.get("skip") and not numbers and not re.match(r"^[А-ЯЁІЎ ]{8,}", first_text)):
            if skip_reason in ("collections", "contacts"):
                col._exclude("collection" if skip_reason == "collections" else "clergy-contacts", {"file": FILE, "page": page_number})
            else:
                col.skip(skip_reason or "front-matter", {"file": FILE, "page": page_number})
            section = {"skip": True, "items": []} if skip_reason else section
            continue
        if page_number <= 2:
            col.skip("title", {"file": FILE, "page": page_number})
            continue

        if not numbers:
            # Announcement continuation or an instruction/front-matter page.
            starts_announcement = bool(re.match(r"^АБ’ЯВЫ", first_text))
            if starts_announcement or announce_mode:
                if starts_announcement:
                    flush_announcement()
                    anchor_match = re.search(r"нядзелю\s+(\d{1,2})\s+(" + "|".join(MONTHS_GENITIVE) + r")\s+(\d{4})", " ".join(l.text for l in all_lines[:3]), re.I)
                    if anchor_match:
                        announce_anchor = dt.date(int(anchor_match.group(3)), MONTHS_GENITIVE[fold(anchor_match.group(2))], int(anchor_match.group(1))).isoformat()
                    elif last_record:
                        d = dt.date.fromisoformat(last_record["date"])
                        announce_anchor = (d + dt.timedelta(days=(6 - d.weekday()) % 7 or 7)).isoformat()
                announce_mode = True
                pending_announcement.extend(l for l in all_lines if not re.match(r"^(Студзень|Люты|Сакавік|Красавік|Май|Чэрвень|Ліпень|Жнівень|Верасень|Кастрычнік|Лістапад|Снежань)$", l.text))
                continue
            title_lines = [l for l in all_lines[:4] if re.sub(r"[^А-ЯЁІЎ]", "", l.text) and l.text.upper() == l.text and len(l.text) > 3]
            if title_lines and (page_number < 20 or "ЎКАЗАННІ" in first_text or "ПРАДПІСАННІ" in first_text or "ПЕРЫЯД" in first_text or "НАБАЖЭНС" in first_text or "АБРАДЫ" in first_text or "ТРЫДУУМ" in first_text or "ЗВЫЧАІ" in first_text or "ЗАПАВЕДЗЬ" in first_text or "ТАБЛІЦА" in first_text or "РУХОМЫЯ" in first_text or "АПЕКУНЫ" in first_text or "ВЫБАР" in first_text or "УДЗЯЛЕННЕ" in first_text or "ЛІТУРГІЧНЫ" in first_text):
                title = " ".join(l.text for l in title_lines)
                section = col.section(title, line_ev(title_lines), scope_hint="front" if page_number < 20 else None)
                body = [l for l in all_lines if l not in title_lines]
            else:
                body = all_lines
                if section is None or section.get("skip"):
                    section = col.section(f"page {page_number}", line_ev(all_lines[:1]), scope_hint=None)
            # Bullets "•" or numbered points start items.
            items: list[list[Line]] = []
            for line in body:
                if re.match(r"^(?:•|\d+\.\s|[а-г]\)\s)", line.text) or not items:
                    items.append([line])
                else:
                    items[-1].append(line)
            for group in items:
                text = join_hyphenated([l.text for l in group]).lstrip("• ")
                col.add_section_item(section, text, line_ev(group, text))
            continue

        # --- calendar page -------------------------------------------------
        header_month, header_year = page_month(words)
        announce_split = next((l for l in all_lines if l.x0 < BOUNDARY and re.match(r"^Аб’явы", l.text)), None)
        if announce_split is not None and announce_split.top < numbers[0]["top"]:
            # Announcements printed above the first band of the page belong to
            # the Sunday that opens the page ("Сёння, 4 студзеня, …").
            flush_announcement()
            pending_announcement = [l for l in all_lines if announce_split.top <= l.top < numbers[0]["top"] - 6]
            announce_mode = False
            flush_announcement()
            announce_split = None
        cutoff = announce_split.top if announce_split else 10_000
        # Lines above the first band continue the previous page's announcement.
        if announce_mode:
            before = [l for l in all_lines if l.bottom < numbers[0]["top"] - 6]
            pending_announcement.extend(before)
            flush_announcement()
            announce_mode = False
        section = None

        bands = []
        for index, number in enumerate(numbers):
            top = number["top"] - 6
            bottom = numbers[index + 1]["top"] - 6 if index + 1 < len(numbers) else cutoff
            bands.append((int(number["text"]), top, min(bottom, cutoff), number))

        for day_number, top, bottom, number_word in bands:
            # Month: header month, but a band may belong to the next month when
            # a page straddles two months ("Снежань 2025 г." then 1 студзеня).
            if day_number < last_number - 20:
                month = month % 12 + 1
                if month == 1:
                    year += 1
            elif header_month and header_month != month and day_number < 8 and last_number > 20:
                month = header_month
            elif header_month and last_number == 0:
                month = header_month
            if header_year and month == 12 and header_month == 12:
                year = header_year
            last_number = day_number
            try:
                date = dt.date(year, month, day_number)
            except ValueError:
                col.unresolve("invalid-date", str(day_number), evidence(FILE, page=page_number, raw=str(day_number)))
                continue

            band_words = [w for w in body_words if top <= w["top"] < bottom and w is not number_word]
            spanning = spanning_lines(band_words, page_number)
            spanning_ids = {id(w) for line in spanning for w in line.words}
            left_words, right_words = split_columns([w for w in band_words if id(w) not in spanning_ids], BOUNDARY)
            left = build_lines(left_words, page_number)
            right = build_lines(right_words, page_number)
            band_lines = sorted(left + right, key=lambda l: l.top)
            ev = evidence(FILE, page=page_number, bbox=[number_word["x0"], top, page.width, min(bottom, page.height)],
                          raw=" ".join(l.text for l in left[:6]))

            # Left column: weekday, celebration until the colour, then readings.
            weekday = None
            celebration: list[Line] = []
            color_lines: list[Line] = []
            readings: list[Line] = []
            stage = "weekday"
            for line in left:
                text = line.text
                if stage == "weekday" and fold(text).split(" ")[0] in WEEKDAYS:
                    weekday = text
                    stage = "title"
                    continue
                if stage in ("weekday", "title") and text.startswith("(") and colors_in(text):
                    color_lines.append(line)
                    stage = "color" if not text.endswith(")") else "readings"
                    continue
                if stage == "color":
                    color_lines.append(line)
                    if text.endswith(")"):
                        stage = "readings"
                    continue
                if stage in ("weekday", "title"):
                    celebration.append(line)
                    stage = "title"
                else:
                    readings.append(line)
            if weekday and WEEKDAYS.get(fold(weekday).split(" ")[0]) != date.isoweekday():
                col.unresolve("weekday-mismatch", f"{day_number} {weekday}", ev)
            title = join_hyphenated([l.text for l in celebration])
            record = col.day(date, ev, {"weekday": weekday, "title": title})
            last_record = record
            color_text = " ".join(l.text for l in color_lines)
            record["colors"].extend(colors_in(color_text))
            if color_text:
                record["colorText"] = color_text
            if title and fold(title) not in ("будзень",):
                col.add_celebration(record, title, detect_rank(title), "primary", line_ev(celebration, title))
            if readings:
                col.add_line(record, join_hyphenated([l.text for l in readings]), line_ev(readings), hint="reading")

            for group in paragraphs(right):
                text = join_hyphenated([l.text for l in group])
                gev = line_ev(group, text)
                alt = re.match(r"^(?:Або|Альбо|Дазволена)\s*:\s*(.+?)(?:\.\s+Імша\b:?(.*))?$", text)
                if alt and detect_rank(alt.group(1), alternative=True) and not re.match(r"^(?:Імша|Св\.\s*Імша)", alt.group(1)):
                    col.add_celebration(record, alt.group(1), detect_rank(alt.group(1), alternative=True),
                                        "alternative" if not text.startswith("Дазволена") else "permitted", gev,
                                        color=(colors_in(text) or [None])[-1])
                    if alt.group(2):
                        col.add_line(record, "Імша:" + alt.group(2), gev, hint="mass")
                        if record.get("_last") is not None:
                            record["_last"]["for"] = "alternative"
                    continue
                col.add_line(record, text, gev, hint="note")
            del band_lines
            # Full-width rubric blocks printed inside a band (Holy Week pages).
            blocks: list[list[Line]] = []
            for line in spanning:
                if blocks and line.top - blocks[-1][-1].bottom < 6:
                    blocks[-1].append(line)
                else:
                    blocks.append([line])
            for block in blocks:
                text = join_hyphenated([l.text for l in block])
                col.add_line(record, text, line_ev(block, text), hint="note")
                if record.get("_last") is not None:
                    record["_last"]["layout"] = "full-width-block"

        if announce_split is not None:
            flush_announcement()
            d = dt.date.fromisoformat(last_record["date"]) if last_record else None
            header = announce_split.text
            anchor_match = re.search(r"нядзелю\s+(\d{1,2})\s+(" + "|".join(MONTHS_GENITIVE) + r")", header)
            if anchor_match and d:
                announce_anchor = dt.date(d.year, MONTHS_GENITIVE[fold(anchor_match.group(2))], int(anchor_match.group(1))).isoformat()
            elif d:
                announce_anchor = (d + dt.timedelta(days=(6 - d.weekday()) % 7 or 7)).isoformat()
            pending_announcement = [l for l in all_lines if l.top >= announce_split.top]
            announce_mode = True

    flush_announcement()
    return col.result()
