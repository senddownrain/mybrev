"""Source-independent collector for adapter output.

Every adapter feeds visual lines/paragraphs into a `Collector`. The collector
applies the exclusions, recognises readings and Mass/Office descriptors and
keeps provenance for every item it stores.
"""

from __future__ import annotations

import datetime as dt
import re

from ordo_common import (
    categorize, clean_text, descriptor_kind, exclusion_category, is_reading_line,
    looks_like_clergy_list, scrub,
)


class Collector:
    def __init__(self, *, diocese: str, file: str, fmt: str, adapter: str):
        self.source = {"diocese": diocese, "file": file, "format": fmt, "adapter": adapter}
        self.days: dict[str, dict] = {}
        self.sections: list[dict] = []
        self.announcements: list[dict] = []
        self.unresolved: list[dict] = []
        self.excluded: list[dict] = []
        self.skipped: list[dict] = []
        self._last_excluded = False
        self._pending_sections: list[dict] = []
        self._last_date: str | None = None

    # -- exclusions -------------------------------------------------------
    def _exclude(self, category: str, ev: dict) -> None:
        location = {k: v for k, v in ev.items() if k != "rawText"}
        self.excluded.append({"category": category, "evidence": location})

    def filter_text(self, text: str, ev: dict, *, continuation_ok: bool = True) -> str:
        """Return the text without excluded content (recording what was removed)."""
        value = clean_text(text)
        if not value:
            return ""
        whole = exclusion_category(value)
        if whole is None and continuation_ok and self._last_excluded and looks_like_clergy_list(value):
            whole = "clergy-list-continuation"
        if whole:
            # Clergy lines are self-contained: drop the whole paragraph. A
            # collection sentence may share a paragraph with real notes, so
            # only that sentence is removed.
            kept, removed = scrub(value) if whole == "collection" else ("", [whole])
            if not kept or len(kept) < 12:
                self._exclude(whole, ev)
                self._last_excluded = whole != "collection"
                return ""
            for category in removed:
                self._exclude(category, ev)
            self._last_excluded = False
            return kept
        kept, removed = scrub(value)
        for category in removed:
            self._exclude(category, ev)
        self._last_excluded = bool(removed) and not kept
        return kept

    # -- days ---------------------------------------------------------------
    def day(self, date: dt.date, ev: dict, header: dict) -> dict:
        key = date.isoformat()
        for section in self._pending_sections:
            section["anchorDate"] = key
        self._pending_sections.clear()
        self._last_date = key
        if key in self.days:
            record = self.days[key]
            record.setdefault("duplicateHeaders", []).append({"header": header, "evidence": ev})
            return record
        record = {
            "date": key,
            "evidence": ev,
            "header": header,
            "color": None,
            "colors": [],
            "psalterWeek": None,
            "celebrations": [],
            "readings": [],
            "lines": [],
        }
        self.days[key] = record
        return record

    def add_celebration(self, record: dict, title: str, rank: str | None, role: str, ev: dict, **extra) -> None:
        text = self.filter_text(title, ev, continuation_ok=False)
        if not text:
            return
        item = {"title": text, "rank": rank, "role": role, "evidence": ev}
        item.update({k: v for k, v in extra.items() if v is not None})
        record["celebrations"].append(item)

    def add_line(self, record: dict, text: str, ev: dict, *, hint: str | None = None) -> None:
        value = self.filter_text(text, ev)
        if not value:
            return
        # Visual continuation of the previous item ("(№№ 76-81)", "святых пастыраў …").
        last = record.get("_last")
        if last is not None and re.match(r"^(?:[a-zа-яёіў(]|\d+(?:[-–]\d+)?\))", value) and not is_reading_line(value):
            last["text"] = clean_text(last["text"] + " " + value)
            last["evidence"].setdefault("continuedBy", []).append({k: v for k, v in ev.items() if k != "rawText"})
            return
        if hint == "reading" or (hint != "note" and is_reading_line(value)):
            record["readings"].append({"text": value, "evidence": ev})
            record["_last"] = record["readings"][-1]
            return
        category, tags = categorize(value)
        kind = descriptor_kind(value) or hint
        item = {"text": value, "category": category, "tags": tags, "evidence": ev}
        if kind in ("mass", "office"):
            item["descriptor"] = kind
        record["lines"].append(item)
        record["_last"] = item

    # -- non-day content ----------------------------------------------------
    def section(self, title: str, ev: dict, *, scope_hint: str | None = None) -> dict:
        section = {"title": clean_text(title), "scopeHint": scope_hint, "evidence": ev, "items": []}
        if self._last_date:
            # Inside the calendar a heading usually introduces the next day
            # (e.g. "ПРАДПІСАННІ НА ВЯЛІКУЮ ПЯТНІЦУ").
            section["previousDate"] = self._last_date
            self._pending_sections.append(section)
        self.sections.append(section)
        return section

    def add_section_item(self, section: dict, text: str, ev: dict) -> None:
        value = self.filter_text(text, ev)
        if not value or len(value) < 3:
            return
        category, tags = categorize(value)
        section["items"].append({"text": value, "category": category, "tags": tags, "evidence": ev})

    def announcement(self, anchor: str | None, text: str, ev: dict, *, target: str | None = None) -> None:
        value = self.filter_text(text, ev)
        if not value or len(value) < 4:
            return
        category, tags = categorize(value)
        self.announcements.append({
            "anchorDate": anchor, "targetDate": target, "text": value,
            "category": category, "tags": tags, "evidence": ev,
        })

    def unresolve(self, reason: str, text: str, ev: dict) -> None:
        value = self.filter_text(text, ev)
        if value:
            self.unresolved.append({"reason": reason, "text": value, "evidence": ev})

    def skip(self, reason: str, ev: dict) -> None:
        location = {k: v for k, v in ev.items() if k != "rawText"}
        self.skipped.append({"reason": reason, "evidence": location})

    # -- output -------------------------------------------------------------
    def _sanitize(self, value) -> None:
        """Last line of defence: no excluded sentence may survive in any
        `text`/`title`/`rawText` field (including provenance snippets)."""
        if isinstance(value, list):
            for item in value:
                self._sanitize(item)
        elif isinstance(value, dict):
            for key in list(value):
                item = value[key]
                if key in ("text", "title", "rawText") and isinstance(item, str):
                    kept, removed = scrub(item)
                    if not removed and looks_like_clergy_list(item) and re.search(r"\(\d{4}\)|\+", item):
                        kept, removed = "", ["clergy-list-continuation"]
                    if removed:
                        value[key] = kept
                        value.setdefault("redacted", sorted(set(value.get("redacted", []) + removed)))
                else:
                    self._sanitize(item)

    def result(self) -> dict:
        days = [self.days[k] for k in sorted(self.days)]
        for record in days:
            record.pop("_last", None)
            colors = []
            for value in record.get("colors", []):
                if value and value not in colors:
                    colors.append(value)
            record["colors"] = colors
            if not record.get("color") and colors:
                record["color"] = colors[0]
        self._sanitize(days)
        self._sanitize(self.sections)
        self._sanitize(self.announcements)
        self._sanitize(self.unresolved)
        dates = [d["date"] for d in days]
        self.source["coverage"] = {"from": dates[0], "to": dates[-1]} if dates else None
        return {
            "source": self.source,
            "days": days,
            "sections": [s for s in self.sections if s["items"]],
            "announcements": self.announcements,
            "unresolved": self.unresolved,
            "excluded": self.excluded,
            "skipped": self.skipped,
        }


def _noop():
    return None


def iso_weekday(date: dt.date) -> int:
    return date.isoweekday()


def strip_markup(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()
