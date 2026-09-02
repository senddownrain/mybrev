#!/usr/bin/env python3
"""
Downloads ru_synodal.json from thiagobodruk/bible, converts to BibleRepository format,
and saves as bible_seed_ru.json.gz (readable by BibleSeedLoader).

Output format (same as bible_seed_bel_nt.json.gz):
  { "books": [ { "id", "name", "order", "chapters": [[verse_str, ...], ...] }, ... ] }

Verses are plain strings (not {num, text} objects) — BibleRepository handles both.
"""

import json, gzip, urllib.request, pathlib, sys, os

SCRIPT_DIR = pathlib.Path(__file__).parent
OUT_JSON   = SCRIPT_DIR / 'bible_seed_ru.json'
OUT_GZ     = SCRIPT_DIR / 'bible_seed_ru.json.gz'

SOURCE_URL = 'https://raw.githubusercontent.com/thiagobodruk/bible/master/json/ru_synodal.json'

# Russian canonical names (Synodal translation)
RU_NAMES = {
    'gn':   'Бытие',
    'ex':   'Исход',
    'lv':   'Левит',
    'nm':   'Числа',
    'dt':   'Второзаконие',
    'js':   'Иисус Навин',
    'jud':  'Судьи',
    'rt':   'Руфь',
    '1sm':  '1 Царств',
    '2sm':  '2 Царств',
    '1kgs': '3 Царств',
    '2kgs': '4 Царств',
    '1ch':  '1 Паралипоменон',
    '2ch':  '2 Паралипоменон',
    'ezr':  'Ездра',
    'ne':   'Неемия',
    'et':   'Есфирь',
    'job':  'Иов',
    'ps':   'Псалтирь',
    'prv':  'Притчи',
    'ec':   'Екклесиаст',
    'so':   'Песня Песней',
    'is':   'Исаия',
    'jr':   'Иеремия',
    'lm':   'Плач Иеремии',
    'ez':   'Иезекииль',
    'dn':   'Даниил',
    'ho':   'Осия',
    'jl':   'Иоиль',
    'am':   'Амос',
    'ob':   'Авдий',
    'jn':   'Иона',
    'mi':   'Михей',
    'na':   'Наум',
    'hk':   'Аввакум',
    'zp':   'Софония',
    'hg':   'Аггей',
    'zc':   'Захария',
    'ml':   'Малахия',
    'mt':   'Евангелие от Матфея',
    'mk':   'Евангелие от Марка',
    'lk':   'Евангелие от Луки',
    'jo':   'Евангелие от Иоанна',
    'act':  'Деяния Апостолов',
    'rm':   'Римлянам',
    '1co':  '1 Коринфянам',
    '2co':  '2 Коринфянам',
    'gl':   'Галатам',
    'eph':  'Ефесянам',
    'ph':   'Филиппийцам',
    'cl':   'Колоссянам',
    '1ts':  '1 Фессалоникийцам',
    '2ts':  '2 Фессалоникийцам',
    '1tm':  '1 Тимофею',
    '2tm':  '2 Тимофею',
    'tt':   'Титу',
    'phm':  'Филимону',
    'hb':   'Евреям',
    'jm':   'Иакова',
    '1pe':  '1 Петра',
    '2pe':  '2 Петра',
    '1jo':  '1 Иоанна',
    '2jo':  '2 Иоанна',
    '3jo':  '3 Иоанна',
    'jd':   'Иуды',
    're':   'Откровение',
}

def main():
    print(f'Downloading {SOURCE_URL} ...')
    req = urllib.request.Request(SOURCE_URL, headers={'User-Agent': 'Mozilla/5.0'})
    with urllib.request.urlopen(req, timeout=60) as r:
        raw = json.loads(r.read())

    print(f'Loaded {len(raw)} books from source.')

    books = []
    for order_0, src in enumerate(raw):
        abbrev = src['abbrev']
        ru_name = RU_NAMES.get(abbrev)
        if ru_name is None:
            print(f'  WARNING: no Russian name for abbrev={abbrev!r}, using English: {src["name"]!r}')
            ru_name = src['name']

        chapters = src['chapters']  # List[List[str]]
        verse_count = sum(len(ch) for ch in chapters)

        books.append({
            'id':       abbrev,
            'name':     ru_name,
            'order':    order_0 + 1,
            'chapters': chapters,   # array-of-arrays of plain strings
        })
        print(f'  {order_0+1:2}. {abbrev:6}  {ru_name:35}  {len(chapters):3} ch  {verse_count:5} v')

    total_verses = sum(len(ch) for b in books for ch in b['chapters'])
    print(f'\nTotal: {len(books)} books, {total_verses} verses')

    out = {'books': books}

    # Write JSON
    OUT_JSON.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Wrote {OUT_JSON} ({OUT_JSON.stat().st_size // 1024} KB)')

    # Write .gz
    with gzip.open(OUT_GZ, 'wb') as f:
        f.write(json.dumps(out, ensure_ascii=False).encode('utf-8'))
    print(f'Wrote {OUT_GZ} ({OUT_GZ.stat().st_size // 1024} KB)')

if __name__ == '__main__':
    main()
