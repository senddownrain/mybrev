"""Shared text rules for the Ordo evidence adapters.

The adapters understand the *layout* of each source document. Everything in
this module is about the *text*: dates, liturgical colours, ranks, line
categories and, most importantly, the exclusions that must never leave the
parser (collections, clergy birthdays, name days, ordination and death
anniversaries, necrology).

The module is deliberately free of liturgical resolution. Aligning a day with
MyBrev's calendar, choosing selectors and classifying evidence happens in
`build.mjs`, which can reuse the app's own JavaScript calendar code.
"""

from __future__ import annotations

import re
import unicodedata

# ---------------------------------------------------------------------------
# Normalisation
# ---------------------------------------------------------------------------

SOFT_HYPHEN = "­"


def clean_text(value: str) -> str:
    """Collapse whitespace, remove soft hyphens and normalise apostrophes."""
    text = unicodedata.normalize("NFC", str(value or ""))
    text = text.replace(SOFT_HYPHEN, "")
    text = text.replace("’", "’").replace("'", "’")
    text = text.replace(" ", " ").replace("\t", " ")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def join_hyphenated(lines: list[str]) -> str:
    """Join visual lines, repairing words split by a trailing hyphen."""
    out = ""
    glue = False
    for raw in lines:
        line = clean_text(raw)
        if not line:
            continue
        if glue:
            out += line
        elif out.endswith("-") and not out.endswith(" -") and re.match(r"^[a-zа-яёіўʼ’]", line):
            out = out[:-1] + line
        elif out:
            out += " " + line
        else:
            out = line
        glue = str(raw).rstrip().endswith(SOFT_HYPHEN)
    return out


def fold(value: str) -> str:
    """Lower-case comparison key (Belarusian aware, Latin I folded to І)."""
    text = clean_text(value).lower()
    return text.replace("i", "і") if re.search(r"[а-яёіў]", text) else text


# ---------------------------------------------------------------------------
# Dates
# ---------------------------------------------------------------------------

MONTHS_GENITIVE = {
    "студзеня": 1, "лютага": 2, "сакавіка": 3, "красавіка": 4, "мая": 5,
    "чэрвеня": 6, "ліпеня": 7, "жніўня": 8, "верасня": 9, "кастрычніка": 10,
    "лістапада": 11, "снежня": 12,
}
MONTHS_NOMINATIVE = {
    "студзень": 1, "люты": 2, "сакавік": 3, "красавік": 4, "май": 5,
    "чэрвень": 6, "ліпень": 7, "жнівень": 8, "верасень": 9, "кастрычнік": 10,
    "лістапад": 11, "снежань": 12, "снежынь": 12,
}
ROMAN_MONTHS = {
    "I": 1, "II": 2, "III": 3, "IV": 4, "V": 5, "VI": 6, "VII": 7,
    "VIII": 8, "IX": 9, "X": 10, "XI": 11, "XII": 12,
}
WEEKDAYS = {
    "нядзеля": 7, "панядзелак": 1, "аўторак": 2, "серада": 3, "чацвер": 4,
    "пятніца": 5, "субота": 6,
}
WEEKDAY_ABBR = {
    "нд": 7, "пн": 1, "ат": 2, "аў": 2, "ср": 3, "чц": 4, "пт": 5, "сб": 6,
}


def latin_roman(value: str) -> str:
    """Grodno mixes Cyrillic І/Х with Latin numerals ("IІІ")."""
    return (value or "").replace("І", "I").replace("Х", "X").replace("У", "V").upper()


def roman_to_int(value: str) -> int | None:
    text = latin_roman(value).strip(". ")
    table = {"I": 1, "V": 5, "X": 10, "L": 50}
    if not text or any(ch not in table for ch in text):
        return None
    total = 0
    for index, ch in enumerate(text):
        current = table[ch]
        nxt = table[text[index + 1]] if index + 1 < len(text) else 0
        total += -current if current < nxt else current
    return total


def month_from_word(word: str) -> int | None:
    key = fold(word).strip(" .,:;")
    return MONTHS_GENITIVE.get(key) or MONTHS_NOMINATIVE.get(key)


# ---------------------------------------------------------------------------
# Colours and ranks
# ---------------------------------------------------------------------------

COLOR_WORDS = {
    "белы": "white", "белага": "white", "фіялетавы": "violet", "чырвоны": "red",
    "зялёны": "green", "ружовы": "rose", "чорны": "black", "залаты": "gold",
}
COLOR_LETTERS = {"Б": "white", "Ф": "violet", "Ч": "red", "З": "green", "Р": "rose", "ЧР": "black"}


def colors_in(text: str) -> list[str]:
    found = []
    for word, value in COLOR_WORDS.items():
        if re.search(rf"(?<![а-яёіў]){word}", fold(text)) and value not in found:
            found.append(value)
    return found


def color_from_letter(token: str) -> str | None:
    return COLOR_LETTERS.get(clean_text(token).upper())


RANK_SOLEMNITY = "solemnitas"
RANK_FEAST = "festum"
RANK_MEMORIAL = "memoria"
RANK_OPTIONAL = "memoria-ad-libitum"
RANK_ALL_SOULS = "commemoratio-defunctorum"


def detect_rank(title: str, *, alternative: bool = False) -> str | None:
    """Rank named in a celebration heading.

    `alternative` marks headings introduced by "Або:"/"альбо:"/"Дазволена:",
    which every source uses for optional memorials.
    """
    text = fold(title)
    # Commemoration of All the Faithful Departed: own row of the Table, not a memorial.
    if re.search(r"(?:ус|ўс)іх\s+памерлых", text):
        return RANK_ALL_SOULS
    if re.search(r"(^|[^а-яёіў])(урачыстасць|урачыстасці|урач\.)", text):
        return RANK_SOLEMNITY
    if re.search(r"неабавязков|ad libitum|ad lib", text):
        return RANK_OPTIONAL
    if re.search(r"(?:або|альбо)\s+(?:ў|у)спамін", text):
        return RANK_OPTIONAL
    if re.search(r"(^|[^а-яёіў])(успамін|ўспамін|усп\.)", text):
        if "абавязков" in text:
            return RANK_MEMORIAL
        return RANK_OPTIONAL if alternative else RANK_MEMORIAL
    if re.search(r"(^|[\s–—-])свята(\s|$)|^свята|(^|\s)свята\s", text):
        return RANK_FEAST
    return None


# ---------------------------------------------------------------------------
# Exclusions
# ---------------------------------------------------------------------------

CLERGY = r"(?:святар|ксяндз|кс\.|а\.|айца|айцец|біскуп|арцыбіскуп|бп|пробашч|дыякан|кардынал|папы|святога айца|інфулат|прэлат|канонік)"

EXCLUSION_RULES: list[tuple[str, re.Pattern]] = [
    ("collection", re.compile(r"збор\w*\s+(?:ахвяраванн|сродкаў|на\s+патрэбы)|ахвяраванн\w*,?\s+(?:сабран|складзен)|ахвяраванн\w*\s+[^.]{0,80}прызнач|сённяшнія\s+зборы|сёння\s*[–—-]\s*збор|калекта\s+на\s+патрэбы|ахвяраванне\s+на\s+(?:патрэбы|мэты)", re.I)),
    ("clergy-birthday", re.compile(rf"(?:дня|дзень)\s+нараджэння\s+(?:св\.\s*п\.\s*)?(?:кардынала|біскупа|арцыбіскупа|святара|кс\.)|дзень\s+нараджэння\s+{CLERGY}|дзень\s+нараджэння\s*:|\(дзень\s+нара-?\s*джэння\)|дні\s+нараджэння\s+святароў", re.I)),
    ("name-day", re.compile(r"імянін|саленізант", re.I)),
    ("ordination-anniversary", re.compile(r"гадавін\w*\s+(?:прэзбітэрск|святарск|біскупск|дыяканск|епіскапск)\w*\s*(?:пасвячэн|рукапалаж|сакр)?|(?:біскупскай|святарскай|епіскапскай)\s+сакры|рукапалажэнн|гадавін\w*\s+(?:прыняцця\s+)?(?:святарства|сакры)|гадавін\w*\s+(?:прызначэння|інгрэсу|інтранізацыі|біскупскага\s+служэння)\b[^.]{0,60}(?:біскуп|кардынал|пробашч|ардынары)", re.I)),
    ("death-anniversary", re.compile(rf"дзень\s+смерці\s+{CLERGY}|гадавін\w*\s+смерці\s+{CLERGY}|гадавіна\s+смерці\s+святароў|памерлыя\s+святары", re.I)),
    ("necrology", re.compile(r"^\s*(?:†|\+)\s*(?:кс|а\.|бп|біск|арцыб|ксяндзы|о\.|айцец|бр\.|дыяк|кардынал|с\.)|^\s*\d{4}\s*[+†]\s*\S|^\s*†\s*[А-ЯЁІЎ]", re.I)),
]

# A line made of several clergy names with years is personal data even when
# the heading that introduced it ("Імяніны святароў:") sits on the previous
# paragraph.
CLERGY_LIST = re.compile(r"(?:(?:кс\.|а\.|біскуп|арцыбіскуп)\s+(?:кан\.\s+|інф\.\s+|д-р\s+)?[А-ЯЁІЎ][^,;()]{1,40}(?:\(\d{4}\))?[,;.]?\s*){2,}")


def exclusion_category(text: str) -> str | None:
    value = clean_text(text)
    for category, pattern in EXCLUSION_RULES:
        if pattern.search(value):
            return category
    return None


def looks_like_clergy_list(text: str) -> bool:
    value = clean_text(text)
    names = re.findall(r"(?:^|[\s,;])(?:кс\.|а\.|бр\.|с\.)\s+(?:кан\.\s+|інф\.\s+)?[А-ЯЁІЎ]", value, re.I)
    return len(names) >= 2 or bool(re.match(r"^[А-ЯЁІЎ][а-яёіў’]+,\s+(?:кс\.|а\.)\s", value))


ABBREVIATION_END = re.compile(r"(?:^|[\s(,])(?:кс|а|св|свв|бл|бп|бпп|кан|інф|т|с|сс|гл|аг|рі|г|гадз|наб|прэф|чыт|усп|урач|благ|муч|м|мм|пн|п|пп|д-р|дк|д-рк|абр|імш|нпм|ап|апп|ев|пар|найсв|прэзб|дк|№)\.$", re.I)
SENTENCE_SPLIT = re.compile(r"(?<=[.;!?])\s+(?=[«“\"(]?[А-ЯЁІЎA-Z0-9†+–—-])")


def split_sentences(text: str) -> list[str]:
    parts: list[str] = []
    for piece in SENTENCE_SPLIT.split(clean_text(text)):
        if parts and ABBREVIATION_END.search(parts[-1]):
            parts[-1] = parts[-1] + " " + piece
        else:
            parts.append(piece)
    return [p for p in parts if p]


def scrub(text: str) -> tuple[str, list[str]]:
    """Remove excluded sentences from `text`.

    Returns the kept text and the categories removed. Sentence boundaries are
    heuristic; over-splitting only makes the removal finer.
    """
    value = clean_text(text)
    if not value:
        return "", []
    whole = exclusion_category(value)
    parts = []
    for piece in SENTENCE_SPLIT.split(value):
        # Do not break after abbreviations such as "кс.", "св.", "Бп", "РІ".
        if parts and ABBREVIATION_END.search(parts[-1]):
            parts[-1] = parts[-1] + " " + piece
        else:
            parts.append(piece)
    if len(parts) == 1:
        return ("", [whole]) if whole else (value, [])
    kept, removed = [], []
    follow = False
    for part in parts:
        category = exclusion_category(part)
        # "Дзень імянінаў Святога Айца. Молімся за саленізанта." and the
        # names that continue a removed list belong to the removed item.
        if not category and follow and (looks_like_clergy_list(part) or re.match(r"^(?:молімся|памолімся)\s+за\s+(?:саленізант|юбіляр|біскупа|святара)", fold(part))):
            category = removed[-1]
        if category:
            removed.append(category)
            follow = True
        else:
            kept.append(part)
            follow = False
    return clean_text(" ".join(kept)), removed


# ---------------------------------------------------------------------------
# Line categories
# ---------------------------------------------------------------------------

BIBLE_BOOKS = (
    "Быц|Зых|Лев|Ліч|Дрг|Нав|Суд|Рут|1 ?Сам|2 ?Сам|1 ?Вал|2 ?Вал|1 ?Кр|2 ?Кр|Езд|Нм|Тоб|Юдт|Эст|1 ?Мак|2 ?Мак|Ёв|Пс|Прып|Экл|Пп|Мдр|Сір|Іс|Ер|Пл|Бар|Эзх|Дан|Ос|Ёэл|Ам|Аўдз|Ён|Міх|Нвм|Абк|Саф|Аг|Зах|Мал|"
    "Мц|Мк|Лк|Ян|Дз|Рым|1 ?Кар|2 ?Кар|Гал|Эф|Флп|Клс|1 ?Тэс|2 ?Тэс|1 ?Цім|2 ?Цім|Ціт|Флм|Гбр|Як|1 ?П|2 ?П|1 ?Ян|2 ?Ян|3 ?Ян|Юд|Ап"
)
BIBLE_REF = re.compile(rf"(?:^|[\s;:(])(?:{BIBLE_BOOKS})\s?\d+\s?,\s?\d")
READING_LABEL = re.compile(r"^(?:чыт\.\s*:|\d\s*чыт\.?|ев\.|евангелле|пс\s|альбо:\s*\d\s*чыт|або:\s*\d\s*чыт|ев\.\s+на\s+працэсію|чыт\.\s*\(|\d\s*чыт\s*\()", re.I)


def is_reading_line(text: str) -> bool:
    value = clean_text(text)
    if READING_LABEL.match(value):
        return True
    if not BIBLE_REF.search(" " + value):
        return False
    # Reading lines are short and dominated by references.
    letters = re.sub(r"[^А-ЯЁІЎа-яёіўA-Za-z]", "", value)
    return len(value) < 140 and len(letters) < 60


CATEGORY_RULES: list[tuple[str, str, re.Pattern]] = [
    # (category, tag, pattern) — evaluated in order, all matches become tags.
    ("local-church", "cathedral", re.compile(r"(?:у|ў)\s+(?:мінскай\s+|віцебскай\s+|пінскай\s+|гродзенскай\s+)?катэдр\w*\s*[–—:-]|^[А-ЯЁІЎ][^:]{1,30}-катэдра:|у\s+катэдральным\s+касцёле\s*[–—-]", re.I)),
    ("local-church", "titular", re.compile(r"тытул\w*\s+(?:касц|капл)|тыт\.\s*касц|урач\.\s+тытула|адпуст\w*\s+(?:у|ў)\s+парафі|тытулярн", re.I)),
    ("liturgical-rule", "transfer", re.compile(r"перанос|перанесен|перанесл", re.I)),
    ("liturgical-rule", "suppressed", re.compile(r"прапускаецца|не\s+адзначаецца|не\s+цэлебруецца|няма\s+(?:ўспаміну|успаміну|свята)|у\s+гэтым\s+годзе\s+няма", re.I)),
    ("liturgical-rule", "holy-day-of-obligation", re.compile(r"абавязак\s+удзелу|удзел\s+у\s+св(?:ятой|\.)\s+імшы\s+абавязков|урачыстасць\s+[“\"«]?абавязковая|абавязковае\s+свята|свята\s+абавязковае", re.I)),
    ("liturgical-rule", "no-obligation", re.compile(r"не\s+з’яўляецца\s+[“\"«]?абавязков|не\s+маюць\s+абавязку\s+ўдзелу", re.I)),
    ("liturgical-rule", "abstinence-dispensation", re.compile(r"(?:няма|не\s+маюць|не\s+абавязвае)\s+абавязк\w*\s+(?:устрыманн|ўстрыманн)|дыспенсацы", re.I)),
    ("liturgical-rule", "penance", re.compile(r"сціслага\s+посту|устрыманн\w*\s+ад\s+мяс|ад\s+мясных\s+страў|дзень\s+пакаяння|пост\s+абавязвае", re.I)),
    ("indulgence", "indulgence", re.compile(r"адпуст", re.I)),
    ("blessing", "blessing", re.compile(r"благаслаўл|благ\.|асвячэнн|пасвячэнне\s+(?:вады|алеяў|свечак)|урач\.\s*благ", re.I)),
    ("procession", "procession", re.compile(r"працэсі", re.I)),
    ("devotion", "novena", re.compile(r"навэн+", re.I)),
    ("devotion", "first-thursday", re.compile(r"(?:першы|і|i|1)\s+чацвер\s+месяца", re.I)),
    ("devotion", "first-friday", re.compile(r"(?:першая|і|i|1)\s+пятніц\w*\s+месяца", re.I)),
    ("devotion", "first-saturday", re.compile(r"(?:першая|і|i|1)\s+субот\w*\s+месяца", re.I)),
    ("devotion", "first-sunday", re.compile(r"(?:першая|і|i|1)\s+нядзел\w*\s+месяца", re.I)),
    ("devotion", "devotion", re.compile(r"набажэнств|(?:^|\s)наб\.|адарацы|ружан|гадзінк|крыжов\w+\s+шлях|шлях\s+святла|горкія\s+жалі|песні\s+жальбы|літані|маёв|майск\w+\s+набаж|чэрвеньск|кастрычніцк|вяночак|апель|малітв\w*\s+да\s+св|падзяка\s+за|чуванне|трыдуум\s+для|рэкалекцы|дзень\s+засяроджан", re.I)),
    ("special-prayer-day", "prayer-day", re.compile(r"(?:сусветны|міжнародны|усебеларускі|агульнакасцёльны)\s+дзень|дзень\s+(?:малітв|малітоўн|хворых|багаслоў|богапасвячонага|святасці|каталіцкіх|сям|жыцця|місій|памяці|пасвячонага|працы|моладзі|пакліканняў|біблі|божага\s+слова|іудаізм|юдаізм)|тыдзень\s+(?:малітв|біблійн|місій|хрысціянскай|сям)|молімся\s+(?:за|аб)|малітвы\s+(?:за|аб)|дні\s+малітв|крыжовыя\s+дні|нядзеля\s+(?:божага\s+слова|божай\s+міласэрнасці|біблійная|місійная|сродкаў)|pro\s+orantibus|фацімскі\s+дзень", re.I)),
    ("office", "office", re.compile(r"^(?:літургія\s+гадзінаў|лг:|аф\.|афіцый)|нешпар|нешп\.|камплет|кампл\.|гадзін\w*\s+чытанн|псалтыр|te\s+deum|цябе,\s+бога", re.I)),
    ("mass", "mass", re.compile(r"^увечары\s+імша|^забаронен\w*\s+[^.]*імш|^дазваляецца\s+[^.]*імш|^(?:імша|імшы|св\.\s+імша|святая\s+імша|дазволена:\s*імша)|прэф|(?:^|[\s,])(?:gl|cr)(?:[\s,.]|$)|(?:^|\s)хвала|(?:^|\s)веру(?:[\s,.]|$)|зжі|зуіп|зуіж|зіж|раратн|пахавальн|эўхарыстычн\w+\s+малітв|секвенцы|імшал|лекцыянар", re.I)),
    ("pastoral-note", "pastoral", re.compile(r"заахвоціць|нагадаць|аб’явіць|абвясціць|пажадана|рэкамендуецца|варта|можна\s+(?:памаліцца|спяваць|упрыгожыць)", re.I)),
]


def categorize(text: str) -> tuple[str, list[str]]:
    """Primary category and tags for one Ordo line."""
    value = clean_text(text)
    tags: list[str] = []
    primary = None
    for category, tag, pattern in CATEGORY_RULES:
        if pattern.search(value):
            if tag not in tags:
                tags.append(tag)
            if primary is None:
                primary = category
    if primary in ("office", "mass") and any(t in tags for t in ("indulgence", "blessing", "procession", "novena", "devotion", "prayer-day")):
        # A rubric line that mainly announces a devotion keeps the display
        # category; structured mass/office flags are still in the tags.
        primary = next(c for c, t, _ in CATEGORY_RULES if t in tags and c not in ("office", "mass"))
    return primary or "other", tags


# Lines that describe the day's Mass/Office formulary (oracle data, not notes).
MASS_DESCRIPTOR = re.compile(r"^(?:імша\s*(?::|ўласная|з\s|са\s|буд|агул|любая|уласная|пра\s|аб\s|вячэры|хрызма)|✠?\s*імша\s)", re.I)
OFFICE_DESCRIPTOR = re.compile(r"^(?:літургія\s+гадзінаў|лг:|аф\.|афіцый\s+з|і\s+нешп|ii?\s+нешп|іі\s+нешп|1-я\s+нешпары|і\s+нешпары|іі\s+нешпары|камплета|псалтыр)", re.I)


def descriptor_kind(text: str) -> str | None:
    value = clean_text(text).lstrip("✠ ")
    if OFFICE_DESCRIPTOR.match(value):
        return "office"
    if MASS_DESCRIPTOR.match(value):
        return "mass"
    return None


def evidence(file: str, *, page: int | None = None, paragraph: int | None = None,
             paragraphs: list[int] | None = None, bbox: list[float] | None = None,
             raw: str = "") -> dict:
    result = {"file": file}
    if page is not None:
        result["page"] = page
    if paragraph is not None:
        result["paragraph"] = paragraph
    if paragraphs:
        result["paragraphs"] = paragraphs
    if bbox:
        result["bbox"] = [round(v, 1) for v in bbox]
    result["rawText"] = clean_text(raw)
    return result
