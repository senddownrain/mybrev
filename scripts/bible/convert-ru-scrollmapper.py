#!/usr/bin/env python3
"""
Downloads RusSynodal.json from scrollmapper/Bible_Databases (78 books, includes
deuterocanonical / apocrypha) and converts to BibleRepository format.

Outputs bible_seed_ru.json.gz — same format as bel version:
  { "books": [ { "id", "name", "order", "chapters": [[str, ...], ...] }, ... ] }

Verses are normalised to plain strings (verse text only, no {num, text}).
Books are reordered to Catholic canonical sequence (73 books).
Extra Orthodox-only books (Prayer of Manasses, 3 Mac, 2 Esd, 1 Esd, Ep. Jeremiah)
are excluded from the canonical output but can be kept with --all.
"""

import json, gzip, urllib.request, pathlib, sys, argparse

SCRIPT_DIR = pathlib.Path(__file__).parent
OUT_JSON   = SCRIPT_DIR / 'bible_seed_ru.json'
OUT_GZ     = SCRIPT_DIR / 'bible_seed_ru.json.gz'

SOURCE_URL = 'https://raw.githubusercontent.com/scrollmapper/Bible_Databases/master/formats/json/RusSynodal.json'

# ----- canonical Catholic order (73 books) -----------------------------------
# Each entry: (book_id, russian_name, scrollmapper_english_name)
CATHOLIC_BOOKS = [
    # Old Testament — 46 books
    ('gn',    'Бытие',               'Genesis'),
    ('ex',    'Исход',               'Exodus'),
    ('lv',    'Левит',               'Leviticus'),
    ('nm',    'Числа',               'Numbers'),
    ('dt',    'Второзаконие',        'Deuteronomy'),
    ('js',    'Иисус Навин',         'Joshua'),
    ('jud',   'Судьи',               'Judges'),
    ('rt',    'Руфь',                'Ruth'),
    ('1sm',   '1 Царств',            'I Samuel'),
    ('2sm',   '2 Царств',            'II Samuel'),
    ('1kgs',  '3 Царств',            'I Kings'),
    ('2kgs',  '4 Царств',            'II Kings'),
    ('1ch',   '1 Паралипоменон',     'I Chronicles'),
    ('2ch',   '2 Паралипоменон',     'II Chronicles'),
    ('ezr',   'Ездра',               'Ezra'),
    ('ne',    'Неемия',              'Nehemiah'),
    ('tob',   'Товит',               'Tobit'),
    ('jdt',   'Иудифь',              'Judith'),
    ('et',    'Есфирь',              'Esther'),
    ('1mac',  '1 Маккавейская',      'I Maccabees'),
    ('2mac',  '2 Маккавейская',      'II Maccabees'),
    ('job',   'Иов',                 'Job'),
    ('ps',    'Псалтирь',            'Psalms'),
    ('prv',   'Притчи',              'Proverbs'),
    ('ec',    'Екклесиаст',          'Ecclesiastes'),
    ('so',    'Песня Песней',        'Song of Solomon'),
    ('wis',   'Премудрость Соломона','Wisdom'),
    ('sir',   'Сирах',               'Sirach'),
    ('is',    'Исаия',               'Isaiah'),
    ('jr',    'Иеремия',             'Jeremiah'),
    ('lm',    'Плач Иеремии',        'Lamentations'),
    # Baruch in Catholic includes Ep. Jeremiah as ch 6 — handled below
    ('bar',   'Варух',               'Baruch'),
    ('ez',    'Иезекииль',           'Ezekiel'),
    ('dn',    'Даниил',              'Daniel'),
    ('ho',    'Осия',                'Hosea'),
    ('jl',    'Иоиль',               'Joel'),
    ('am',    'Амос',                'Amos'),
    ('ob',    'Авдий',               'Obadiah'),
    ('jn',    'Иона',                'Jonah'),
    ('mi',    'Михей',               'Micah'),
    ('na',    'Наум',                'Nahum'),
    ('hk',    'Аввакум',             'Habakkuk'),
    ('zp',    'Софония',             'Zephaniah'),
    ('hg',    'Аггей',               'Haggai'),
    ('zc',    'Захария',             'Zechariah'),
    ('ml',    'Малахия',             'Malachi'),
    # New Testament — 27 books
    ('mt',    'Евангелие от Матфея', 'Matthew'),
    ('mk',    'Евангелие от Марка',  'Mark'),
    ('lk',    'Евангелие от Луки',   'Luke'),
    ('jo',    'Евангелие от Иоанна', 'John'),
    ('act',   'Деяния Апостолов',    'Acts'),
    ('rm',    'Римлянам',            'Romans'),
    ('1co',   '1 Коринфянам',        '1 Corinthians'),   # source uses "I Corinthians"
    ('2co',   '2 Коринфянам',        '2 Corinthians'),
    ('gl',    'Галатам',             'Galatians'),
    ('eph',   'Ефесянам',            'Ephesians'),
    ('ph',    'Филиппийцам',         'Philippians'),
    ('cl',    'Колоссянам',          'Colossians'),
    ('1ts',   '1 Фессалоникийцам',   '1 Thessalonians'),
    ('2ts',   '2 Фессалоникийцам',   '2 Thessalonians'),
    ('1tm',   '1 Тимофею',           '1 Timothy'),
    ('2tm',   '2 Тимофею',           '2 Timothy'),
    ('tt',    'Титу',                'Titus'),
    ('phm',   'Филимону',            'Philemon'),
    ('hb',    'Евреям',              'Hebrews'),
    ('jm',    'Иакова',              'James'),
    ('1pe',   '1 Петра',             'I Peter'),
    ('2pe',   '2 Петра',             'II Peter'),
    ('1jo',   '1 Иоанна',            'I John'),
    ('2jo',   '2 Иоанна',            'II John'),
    ('3jo',   '3 Иоанна',            'III John'),
    ('jd',    'Иуды',                'Jude'),
    ('re',    'Откровение',          'Revelation of John'),
]

# Alternative name spellings used in the source
ALIASES = {
    'I Corinthians':    '1 Corinthians',
    'II Corinthians':   '2 Corinthians',
    'I Thessalonians':  '1 Thessalonians',
    'II Thessalonians': '2 Thessalonians',
    'I Timothy':        '1 Timothy',
    'II Timothy':       '2 Timothy',
}

def chapters_to_verse_strings(raw_chapters):
    """Convert scrollmapper chapter list to list-of-list-of-strings."""
    out = []
    for ch in raw_chapters:
        verses = ch.get('verses', [])
        # Each verse: {verse: int, text: str}
        verse_strings = [v['text'] for v in verses]
        out.append(verse_strings)
    return out

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--all', action='store_true', help='Include non-Catholic Orthodox books too')
    args = parser.parse_args()

    print(f'Downloading {SOURCE_URL} ...')
    req = urllib.request.Request(SOURCE_URL, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = json.loads(r.read())

    src_books = data['books']
    print(f'Source: {data["translation"]}')
    print(f'Loaded {len(src_books)} books from scrollmapper.')

    # Index by normalised name
    name_to_src = {}
    for b in src_books:
        raw = b['name']
        name_to_src[raw] = b
        # also index without roman numeral prefix (I → 1 etc.)
        if raw in ALIASES:
            name_to_src[ALIASES[raw]] = b

    # Also index with normalised roman numerals
    roman = {'I ': '1 ', 'II ': '2 ', 'III ': '3 '}
    for b in src_books:
        for r, n in roman.items():
            if b['name'].startswith(r):
                name_to_src[b['name'].replace(r, n, 1)] = b

    # Handle Epistle of Jeremiah → will be appended to Baruch as chapter 6
    ep_jer = name_to_src.get('Epistle of Jeremiah')
    ep_jer_chapters = chapters_to_verse_strings(ep_jer['chapters']) if ep_jer else []

    books_out = []
    missing = []
    for order_1, (book_id, ru_name, en_name) in enumerate(CATHOLIC_BOOKS, start=1):
        src = name_to_src.get(en_name)
        if src is None:
            missing.append(en_name)
            print(f'  MISSING: {en_name}')
            continue

        chapters = chapters_to_verse_strings(src['chapters'])

        # Baruch: append Epistle of Jeremiah as chapter 6 (Catholic tradition)
        if book_id == 'bar' and ep_jer_chapters:
            chapters = chapters + ep_jer_chapters
            print(f'  → Appended Epistle of Jeremiah as Baruch ch {len(chapters)}')

        verse_count = sum(len(ch) for ch in chapters)
        print(f'  {order_1:2}. {book_id:5}  {ru_name:35}  {len(chapters):3} ch  {verse_count:5} v')

        books_out.append({
            'id':       book_id,
            'name':     ru_name,
            'order':    order_1,
            'chapters': chapters,
        })

    total_verses = sum(len(ch) for b in books_out for ch in b['chapters'])
    print(f'\nTotal: {len(books_out)} books, {total_verses} verses')
    if missing:
        print(f'Missing: {missing}')

    out = {'books': books_out}

    OUT_JSON.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Wrote {OUT_JSON} ({OUT_JSON.stat().st_size // 1024} KB)')

    with gzip.open(OUT_GZ, 'wb') as f:
        f.write(json.dumps(out, ensure_ascii=False).encode('utf-8'))
    print(f'Wrote {OUT_GZ} ({OUT_GZ.stat().st_size // 1024} KB)')

if __name__ == '__main__':
    main()
