#!/usr/bin/env python3
"""
Parses all 27 NT books from catholic.by EPUBs and outputs
bible_seed_bel_nt.json(.gz) in BibleRepository format:

  { "books": [ { "id", "name", "order",
                 "chapters": [[{"num": int, "text": str}, ...], ...] }, ... ] }

Source: https://catholic.by/3/lib/bible (EPUB per book,
© Канферэнцыя Каталіцкіх Біскупаў у Беларусі, Мінск 2017).

Verses keep explicit numbers because the Catholic.by edition omits the
text-critical verses (Mt 17:21, Mk 7:16, Jn 5:4, …), so positional numbering
would shift every following verse.

The EPUB markup is not uniform, so the parser works block by block:
  * <h1>N</h1>, a bold-only block "N" or a leading bold "N" → chapter N
  * <sup>N</sup> → verse N;  <sup>(N)</sup> → omitted verse (no text)
  * a bare "17А…" at a word start (missing <sup>) → verse 17
  * bold-only blocks and <h2>/<h3>/<h4> → section headings (dropped)
  * <p class="copy"> → copyright line (dropped)
Afterwards the text is normalised (Latin homoglyphs → Cyrillic, a reviewed
list of words glued together in the source, punctuation spacing) and every
change is logged so it can be reviewed.

Usage:
  python3 scripts/bible/parse-bel-nt.py                       # download EPUBs
  python3 scripts/bible/parse-bel-nt.py --cache-dir DIR       # reuse/save EPUBs in DIR
"""
import argparse
import gzip
import io
import json
import re
import sys
import time
import urllib.request
import zipfile
from html.parser import HTMLParser
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
OUT_GZ = SCRIPT_DIR / "bible_seed_bel_nt.json.gz"
OUT_JSON = SCRIPT_DIR / "bible_seed_bel_nt.json"

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

LOG = []


def log(book_id, msg):
    LOG.append(f"{book_id}: {msg}")


# ── HTML → blocks ─────────────────────────────────────────────────────────────
BLOCK_TAGS = {"p", "h1", "h2", "h3", "h4", "h5", "h6", "div"}


class BlockCollector(HTMLParser):
    """Flattens the EPUB body into blocks of (kind, text, bold) segments."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.blocks = []
        self._block = None
        self._bold = 0
        self._sup = 0
        self._ignore = 0

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "title", "head"):
            self._ignore += 1
        elif tag in BLOCK_TAGS:
            self._block = {"tag": tag, "cls": dict(attrs).get("class", ""), "segs": []}
            self.blocks.append(self._block)
        elif tag == "b":
            self._bold += 1
        elif tag == "sup":
            self._sup += 1
            if self._block is not None:
                self._block["segs"].append(["sup", "", False])
        elif tag == "br" and self._block is not None:
            self._block["segs"].append(["text", " ", False])

    def handle_startendtag(self, tag, attrs):
        if tag == "br" and self._block is not None:
            self._block["segs"].append(["text", " ", False])

    def handle_endtag(self, tag):
        if tag in ("script", "style", "title", "head"):
            self._ignore = max(0, self._ignore - 1)
        elif tag in BLOCK_TAGS:
            self._block = None
        elif tag == "b":
            self._bold = max(0, self._bold - 1)
        elif tag == "sup":
            self._sup = max(0, self._sup - 1)

    def handle_data(self, data):
        if self._ignore or self._block is None:
            return
        segs = self._block["segs"]
        if self._sup and segs and segs[-1][0] == "sup":
            segs[-1][1] += data
        else:
            segs.append(["text", data, self._bold > 0])


# ── Blocks → chapters/verses ──────────────────────────────────────────────────
EMBEDDED_VERSE = re.compile(r"(?:(?<=\s)|^)(\d{1,3})(?=[^\W\d_])")


class BookBuilder:
    def __init__(self, book_id):
        self.book_id = book_id
        self.chapters = {1: []}
        self.chapter = 1
        self.verse = None  # [num, [parts]]

    def flush(self):
        if self.verse is not None:
            text = " ".join("".join(self.verse[1]).split())
            if text:
                self.chapters[self.chapter].append({"num": self.verse[0], "text": text})
            else:
                log(self.book_id, f"{self.chapter}:{self.verse[0]} empty verse dropped")
        self.verse = None

    def new_chapter(self, num):
        self.flush()
        if num != self.chapter and num != self.chapter + 1:
            log(self.book_id, f"unexpected chapter jump {self.chapter} → {num}")
        if num != self.chapter and self.chapters.get(num):
            raise ValueError(f"{self.book_id}: chapter {num} appears twice")
        self.chapter = num
        self.chapters.setdefault(num, [])

    def new_verse(self, num):
        self.flush()
        self.verse = [num, []]

    def add_text(self, text):
        if self.verse is None:
            if text.strip():
                # Continuation of the previous verse (e.g. after an omitted-verse marker).
                verses = self.chapters[self.chapter]
                if not verses:
                    log(self.book_id, f"{self.chapter}: text before first verse dropped: {text.strip()[:60]!r}")
                    return
                last = verses.pop()
                log(self.book_id, f"{self.chapter}:{last['num']} continued by unnumbered text {text.strip()[:40]!r}")
                self.verse = [last["num"], [last["text"], " "]]
            else:
                return
        self.verse[1].append(text)

    def add_verse_text(self, text):
        pos = 0
        for m in EMBEDDED_VERSE.finditer(text):
            self.add_text(text[pos:m.start()])
            num = int(m.group(1))
            log(self.book_id, f"{self.chapter}:{num} recovered verse number without <sup>")
            self.new_verse(num)
            pos = m.end()
        self.add_text(text[pos:])

    def block(self, blk):
        tag, cls, segs = blk["tag"], blk["cls"], blk["segs"]
        plain = " ".join("".join(s[1] for s in segs if s[0] == "text").split())
        if cls == "copy" or tag in ("h2", "h3", "h4", "h5", "h6"):
            return
        if tag == "h1":
            if re.fullmatch(r"\d+", plain):
                self.new_chapter(int(plain))
            elif plain:
                log(self.book_id, f"non-numeric h1 dropped: {plain!r}")
            return
        has_sup = any(s[0] == "sup" for s in segs)
        text_segs = [s for s in segs if s[0] == "text" and s[1].strip()]
        if not has_sup and text_segs and all(s[2] or not re.search(r"\w", s[1]) for s in text_segs):
            if re.fullmatch(r"\d+", plain):
                self.new_chapter(int(plain))
            # otherwise: section heading → dropped
            return
        first = True
        for kind, text, bold in segs:
            if kind == "sup":
                raw = text.strip()
                if re.fullmatch(r"\d+", raw):
                    self.new_verse(int(raw))
                elif re.fullmatch(r"\(\d+\)(\s+\d+)?", raw):
                    self.flush()
                    log(self.book_id, f"{self.chapter}:{raw} omitted verse marker")
                    following = raw.split(")")[1].strip()
                    if following:
                        self.new_verse(int(following))
                elif raw:
                    log(self.book_id, f"{self.chapter}: unexpected <sup> {raw!r}")
                first = False
                continue
            if not text.strip():
                self.add_text(text)
                continue
            if bold and first and re.fullmatch(r"\s*\d+\s*", text):
                self.new_chapter(int(text))
            else:
                if bold:
                    log(self.book_id, f"{self.chapter}: bold text kept inside verse: {text.strip()!r}")
                self.add_verse_text(text)
            first = False
        self.add_text(" ")

    def result(self):
        self.flush()
        nums = sorted(self.chapters)
        if nums != list(range(1, len(nums) + 1)):
            raise ValueError(f"{self.book_id}: chapter numbers not sequential: {nums}")
        return [fix_verse_numbers(self.book_id, n, self.chapters[n]) for n in nums]


# Verse markers missing in the source, split per standard versification:
# (book, chapter, marked verse) → (number of the leading part, its exact text).
MANUAL_SPLITS = {
    ("1co", 15, 37): (36, "Неразумны! Тое, што ты сееш, не ажыве, перш чым не памрэ."),
}


def apply_manual_splits(book_id, chapter, verses):
    out = []
    for v in verses:
        split = MANUAL_SPLITS.get((book_id, chapter, v["num"]))
        if split:
            num, head = split
            if not v["text"].startswith(head + " "):
                raise ValueError(f"{book_id} {chapter}:{v['num']}: manual split text not found")
            log(book_id, f"{chapter}:{v['num']} split off missing verse {num}")
            out.append({"num": num, "text": head})
            out.append({"num": v["num"], "text": v["text"][len(head):].strip()})
        else:
            out.append(v)
    return out


def fix_verse_numbers(book_id, chapter, verses):
    """Fixes typos like Lk 20: 31, 33, 33, 34 → 31, 32, 33, 34."""
    verses = apply_manual_splits(book_id, chapter, verses)
    for i in range(1, len(verses) - 1):
        prev, cur, nxt = verses[i - 1]["num"], verses[i]["num"], verses[i + 1]["num"]
        if cur == nxt and cur == prev + 2:
            log(book_id, f"{chapter}:{cur} duplicated number → {prev + 1}")
            verses[i]["num"] = prev + 1
    nums = [v["num"] for v in verses]
    if any(b <= a for a, b in zip(nums, nums[1:])):
        raise ValueError(f"{book_id} {chapter}: verse numbers not increasing: {nums}")
    return verses


def download_epub(url, cache_dir):
    name = url.rsplit("/", 1)[1]
    if cache_dir:
        cached = Path(cache_dir) / name
        if cached.exists() and cached.stat().st_size > 1000:
            return cached.read_bytes()
    last = None
    for attempt in range(4):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=60) as resp:
                data = resp.read()
            if cache_dir:
                Path(cache_dir).mkdir(parents=True, exist_ok=True)
                (Path(cache_dir) / name).write_bytes(data)
            return data
        except Exception as err:  # noqa: BLE001 — network is flaky, retry
            last = err
            time.sleep(2 * (attempt + 1))
    raise last


def find_content_html(zf):
    candidates = [
        n for n in zf.namelist()
        if (n.endswith(".html") or n.endswith(".xhtml"))
        and "titlepage" not in n and "cover" not in n
    ]
    if not candidates:
        return None
    return zf.read(max(candidates, key=lambda n: zf.getinfo(n).file_size))


def parse_epub(epub_bytes, book_id):
    html_bytes = find_content_html(zipfile.ZipFile(io.BytesIO(epub_bytes)))
    if html_bytes is None:
        raise ValueError(f"{book_id}: no content HTML in EPUB")
    collector = BlockCollector()
    collector.feed(html_bytes.decode("utf-8", errors="replace"))
    builder = BookBuilder(book_id)
    for blk in collector.blocks:
        builder.block(blk)
    return builder.result()


# ── Text normalisation ────────────────────────────────────────────────────────
CYR = "А-Яа-яЁёІіЎў"
WORD = re.compile(rf"[{CYR}A-Za-z’']+")
HOMOGLYPHS = str.maketrans({
    "A": "А", "B": "В", "C": "С", "E": "Е", "H": "Н", "I": "І", "K": "К", "M": "М",
    "O": "О", "P": "Р", "T": "Т", "X": "Х", "Y": "У",
    "a": "а", "c": "с", "e": "е", "i": "і", "o": "о", "p": "р", "x": "х", "y": "у",
})
# Known typos in the source that are not homoglyphs.
TEXT_FIXES = [
    ("нарzzадзіў", "нарадзіў"),
]


def fix_homoglyphs(book_id, ref, text):
    def repl(m):
        word = m.group(0)
        if not re.search(r"[A-Za-z]", word):
            return word
        fixed = word.translate(HOMOGLYPHS)
        if re.search(r"[A-Za-z]", fixed):
            log(book_id, f"{ref} Latin letters left in {word!r}")
            return word
        return fixed
    out = WORD.sub(repl, text)
    if out != text:
        log(book_id, f"{ref} homoglyphs: {sum(a != b for a, b in zip(text, out))} chars")
    return out


# Words glued together in the Catholic.by EPUB source (no space between them),
# reviewed by hand. Applied to whole tokens only, per book.
GLUED_WORDS = {
    "mt": {
        "двухбратоў": "двух братоў",
    },
    "lk": {
        "першчым": "перш чым",
        "селіразам": "селі разам",
    },
    "acts": {
        "усімнародам": "усім народам",
        "імнекаторыя": "ім некаторыя",
    },
    "heb": {
        "Ямуўсе": "Яму ўсе",
        "Тыпалюбіў": "Ты палюбіў",
        "аТы": "а Ты",
        "Яныпрамінуць": "Яны прамінуць",
        "Тыўчыніў": "Ты ўчыніў",
        "Майсейбыў": "Майсей быў",
        "нерабіце": "не рабіце",
        "учас": "у час",
        "напрацягу": "на працягу",
        "ТамуЯ": "Таму Я",
        "можамшматсказаць": "можам шмат сказаць",
        "ўменнеадрозніваць": "ўменне адрозніваць",
        "даброізло": "дабро і зло",
        "Абрагамудзяліў": "Абрагам удзяліў",
        "Нетакі": "Не такі",
        "Восьтой": "Вось той",
        "Ініхто": "І ніхто",
        "ўсвятыню": "ў святыню",
        "ІнакшЯму": "Інакш Яму",
        "ТадыЯ": "Тады Я",
        "аграхоў": "а грахоў",
        "сведчаннядвух": "сведчання двух",
        "Амой": "А мой",
        "якзорак": "як зорак",
        "Бокаго": "Бо каго",
        "Рабіцепростыя": "Рабіце простыя",
        "трываймаў": "трывайма ў",
    },
    "1pe": {
        "моцнаспадзявайцеся": "моцна спадзявайцеся",
        "быццамцвет": "быццам цвет",
        "апаўцвет": "апаў цвет",
        "ўсяслава": "ўся слава",
        "Аслова": "А слова",
        "трываенавекі": "трывае навекі",
        "Ігэтым": "І гэтым",
        "наСіёневуглавы": "на Сіёне вуглавы",
        "хтоверыць": "хто верыць",
        "каліб’юцьвас": "калі б’юць вас",
        "калічыніцедабро": "калі чыніце дабро",
        "тагопакліканы": "таго пакліканы",
        "Хрыстусцярпеў": "Хрыстус цярпеў",
        "ўчыніўграху": "ўчыніў граху",
        "Ёнсам": "Ён сам",
        "ўзнёсграхі": "ўзнёс грахі",
        "Высталіяедзецьмі": "Вы сталі яе дзецьмі",
        "робіцедабро": "робіце дабро",
        "баіцесянічога": "баіцеся нічога",
        "слабейшамужаночаму": "слабейшаму жаночаму",
        "будучысуспадкаемцамі": "будучы суспадкаемцамі",
        "ласкіжыцця": "ласкі жыцця",
        "неставіць": "не ставіць",
        "вашаймалітве": "вашай малітве",
        "аддавайцезлом": "аддавайце злом",
        "злоцізнявагай": "зло ці знявагай",
        "аленаадварот": "але наадварот",
        "бодзеля": "бо дзеля",
        "кабунаследаваць": "каб унаследаваць",
        "Няхайадвернецца": "Няхай адвернецца",
        "няхайшукае": "няхай шукае",
        "Бовочы": "Бо вочы",
        "Панасвяціце": "Пана свяціце",
        "Хрыстусразпацярпеў": "Хрыстус раз пацярпеў",
        "кабпрывесці": "каб прывесці",
        "Забітыўцеле": "Забіты ў целе",
        "няхайпрамаўляе": "няхай прамаўляе",
        "нехтацерпіць": "нехта церпіць",
        "алепраслаўляе": "але праслаўляе",
        "Ікалі": "І калі",
        "статакБожы": "статак Божы",
        "штопры": "што пры",
        "падпрымусам": "пад прымусам",
        "воляйБожай": "воляй Божай",
        "дзеляагіднайнажывы": "дзеля агіднай нажывы",
        "сашчырымжаданнем": "са шчырым жаданнем",
        "злоўжывайцеўладаю": "злоўжывайце ўладаю",
        "станьцепрыкладам": "станьце прыкладам",
        "каліз’явіццаНайвышэйшыПастыр": "калі з’явіцца Найвышэйшы Пастыр",
        "здабудзеценеўвядальнывянок": "здабудзеце неўвядальны вянок",
        "Апраніцесяўсеваўзаемнуюпакору": "Апраніцеся ўсе ва ўзаемную пакору",
        "супраціўляеццаганарыстым": "супраціўляецца ганарыстым",
        "пакорнымдае": "пакорным дае",
        "станьцепакорныміпадмоцнаю": "станьце пакорнымі пад моцнаю",
        "кабЁнузвысіў": "каб Ён узвысіў",
        "клопатускладзіце": "клопат ускладзіце",
        "боЁнклапоціццапра": "бо Ён клапоціцца пра",
        "Праціўнікваш": "Праціўнік ваш",
        "леўкружыць": "леў кружыць",
        "кагопажэрці": "каго пажэрці",
        "станьцесупрацьяго": "станьце супраць яго",
        "штотакія": "што такія",
        "цярпеннізведваюць": "цярпенні зведваюць",
        "вашыябраты": "вашыя браты",
        "усялякайласкі": "усялякай ласкі",
        "якіпаклікаў": "які паклікаў",
        "сваёйвечнай": "сваёй вечнай",
        "ХрысцеЕзусе": "Хрысце Езусе",
        "паслятаго": "пасля таго",
        "крыхупацерпіце": "крыху пацерпіце",
        "панаванненавекі": "панаванне навекі",
        "ПразСільвана": "Праз Сільвана",
        "якіздаецца": "які здаецца",
        "коратканапісаў": "коратка напісаў",
        "ёсцьсапраўдная": "ёсць сапраўдная",
        "якойтрываеце": "якой трываеце",
        "адзінаднагопацалункамлюбові": "адзін аднаго пацалункам любові",
        "Спакойусім": "Спакой усім",
        "якіятрываеце": "якія трываеце",
    },
    "1jn": {
        "ўсялякіфальш": "ўсялякі фальш",
        "хтозводзіць": "хто зводзіць",
        "мыдзеці": "мы дзеці",
        "Ёнаб’явіцца": "Ён аб’явіцца",
        "акожны": "а кожны",
        "аддацьжыццё": "аддаць жыццё",
        "любіцьне": "любіць не",
        "якогадаў": "якога даў",
        "штоЁнжыве": "што Ён жыве",
        "павіннылюбіцьадзінаднаго": "павінны любіць адзін аднаго",
        "ніхтоніколі": "ніхто ніколі",
        "любімадзінаднаго": "любім адзін аднаго",
        "любоўЯгоная": "любоў Ягоная",
        "тымпазнаём": "тым пазнаём",
        "штоЁндаў": "што Ён даў",
        "штоАйцецпаслаў": "што Айцец паслаў",
        "Хтовызнае": "Хто вызнае",
        "штоЕзус": "што Езус",
        "тымжыве": "тым жыве",
        "уБогу": "у Богу",
        "перадпакараннем": "перад пакараннем",
        "братасвайгоненавідзіць": "брата свайго ненавідзіць",
        "любіцьсвайго": "любіць свайго",
        "якогабачыць": "якога бачыць",
        "можалюбіць": "можа любіць",
        "такуюзапаведзь": "такую запаведзь",
        "хтолюбіць": "хто любіць",
        "захоўваліЯгоныязапаведзі": "захоўвалі Ягоныя запаведзі",
        "з’яўляюццацяжкімі": "з’яўляюцца цяжкімі",
        "штонароджана": "што народжана",
        "гэтайперамогай": "гэтай перамогай",
        "сведчаннебольшае": "сведчанне большае",
        "Ёндаў": "Ён даў",
        "яківядзе": "які вядзе",
        "маліўсяза": "маліўся за",
        "боНароджаны": "бо Народжаны",
        "захоўваеяго": "захоўвае яго",
        "уПраўдзівым": "у Праўдзівым",
    },
}

def unglue(book_id, ref, text):
    fixes = GLUED_WORDS.get(book_id, {})

    def repl(m):
        word = m.group(0)
        fixed = fixes.get(word)
        if fixed is None:
            if re.search(r"[а-яёіў][А-ЯЁІЎ]", word):
                log(book_id, f"{ref} WARNING possible glued words left: {word!r}")
            return word
        USED_GLUE.add((book_id, word))
        log(book_id, f"{ref} unglued {word!r} → {fixed!r}")
        return fixed
    return WORD.sub(repl, text)


USED_GLUE = set()


def normalise_text(book_id, ref, text):
    for bad, good in TEXT_FIXES:
        if bad in text:
            log(book_id, f"{ref} typo {bad!r} → {good!r}")
            text = text.replace(bad, good)
    text = fix_homoglyphs(book_id, ref, text)
    text = unglue(book_id, ref, text)
    # missing space after punctuation: "Мой,Я", "Цябе»,і"
    spaced = re.sub(rf"([,;:!?])(?=[{CYR}«“])", r"\1 ", text)
    spaced = re.sub(rf"([.])(?=[{CYR}]{{2}})", r"\1 ", spaced)
    if spaced != text:
        log(book_id, f"{ref} punctuation spacing")
    return " ".join(spaced.split())


def normalise(books):
    for b in books:
        for ci, ch in enumerate(b["chapters"], 1):
            for v in ch:
                v["text"] = normalise_text(b["id"], f"{ci}:{v['num']}", v["text"])
    unused = [(book, word) for book, words in GLUED_WORDS.items() for word in words
              if (book, word) not in USED_GLUE]
    if unused:
        raise ValueError(f"glue fixes that matched nothing: {unused}")


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache-dir", help="directory to reuse/save downloaded EPUBs")
    ap.add_argument("--log", help="write the normalisation log to this file")
    args = ap.parse_args()

    out_books = []
    for i, (book_id, name, order, filename) in enumerate(BOOKS, 1):
        print(f"[{i:2d}/{len(BOOKS)}] {name}", flush=True)
        chapters = parse_epub(download_epub(f"{BASE}{filename}.epub", args.cache_dir), book_id)
        print(f"         {len(chapters)} chapters, {sum(len(c) for c in chapters)} verses", flush=True)
        out_books.append({"id": book_id, "name": name, "order": order, "chapters": chapters})
        if not args.cache_dir:
            time.sleep(0.3)  # be polite

    if len(out_books) != 27:
        sys.exit(f"Expected 27 NT books, got {len(out_books)}")
    normalise(out_books)

    data = {"books": out_books}
    json_bytes = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    with open(OUT_GZ, "wb") as raw, gzip.GzipFile(fileobj=raw, mode="wb", compresslevel=9, mtime=0) as f:
        f.write(json_bytes)
    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")

    total_chapters = sum(len(b["chapters"]) for b in out_books)
    total_verses = sum(len(ch) for b in out_books for ch in b["chapters"])
    print(f"\nDone: {len(out_books)} books, {total_chapters} chapters, {total_verses} verses → {OUT_GZ}")
    if args.log:
        Path(args.log).write_text("\n".join(LOG) + "\n", encoding="utf-8")
        print(f"{len(LOG)} log lines → {args.log}")
    else:
        print("\n".join(LOG))


if __name__ == "__main__":
    main()
