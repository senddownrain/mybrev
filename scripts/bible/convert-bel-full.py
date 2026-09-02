#!/usr/bin/env python3
"""
Builds the full Belarusian Bible (66 books):
  - OT (39 books): Boken translation from eBible USFM (already at /tmp/bel_usfm/)
  - NT (27 books): Catholic translation from catholic.by (bible_seed_bel_nt.json.gz)

Outputs bible_seed_bel.json.gz in BibleRepository format:
  { "books": [ { "id", "name", "order", "chapters": [[str, ...], ...] }, ... ] }
"""

import json, gzip, re, pathlib, sys

SCRIPT_DIR   = pathlib.Path(__file__).parent
USFM_DIR     = pathlib.Path('/tmp/bel_usfm')
NT_SEED      = SCRIPT_DIR / 'bible_seed_bel_nt.json.gz'
OUT_JSON     = SCRIPT_DIR / 'bible_seed_bel.json.gz'

# ── OT book map: (usfm_code, our_id, belarusian_name) ──────────────────────
# IDs chosen not to conflict with existing NT IDs (jn=John, jud=Jude)
OT_BOOKS = [
    ('GEN', 'gn',   'Быццё'),
    ('EXO', 'ex',   'Зыход'),
    ('LEV', 'lv',   'Левіт'),
    ('NUM', 'nm',   'Лікі'),
    ('DEU', 'dt',   'Другазаконне'),
    ('JOS', 'js',   'Кніга Ісуса Навіна'),
    ('JDG', 'jdg',  'Кніга Суддзяў'),
    ('RUT', 'rt',   'Кніга Руты'),
    ('1SA', '1sm',  '1-я Кніга Самуіла'),
    ('2SA', '2sm',  '2-я Кніга Самуіла'),
    ('1KI', '1kgs', '1-я Кніга Цароў'),
    ('2KI', '2kgs', '2-я Кніга Цароў'),
    ('1CH', '1ch',  '1-я Кніга Хронікаў'),
    ('2CH', '2ch',  '2-я Кніга Хронікаў'),
    ('EZR', 'ezr',  'Кніга Ездры'),
    ('NEH', 'ne',   'Кніга Неемія'),
    ('EST', 'et',   'Кніга Эсфіры'),
    ('JOB', 'job',  'Кніга Іова'),
    ('PSA', 'ps',   'Псалмы'),
    ('PRO', 'prv',  'Прыпавесці'),
    ('ECC', 'ec',   'Экклезіяст'),
    ('SNG', 'so',   'Песня Песняў'),
    ('ISA', 'is',   'Ісая'),
    ('JER', 'jr',   'Ераміяш'),
    ('LAM', 'lm',   'Плач Ерамія'),
    ('EZK', 'ez',   'Езэкіэль'),
    ('DAN', 'dn',   'Данііл'),
    ('HOS', 'ho',   'Осія'),
    ('JOL', 'jl',   'Іоіль'),
    ('AMO', 'am',   'Амос'),
    ('OBA', 'ob',   'Авдзій'),
    ('JON', 'jon',  'Іона'),  # 'jon' not 'jn' (John NT uses 'jn')
    ('MIC', 'mi',   'Міхей'),
    ('NAM', 'na',   'Наум'),
    ('HAB', 'hk',   'Аввакум'),
    ('ZEP', 'zp',   'Сафонія'),
    ('HAG', 'hg',   'Аггей'),
    ('ZEC', 'zc',   'Захарыя'),
    ('MAL', 'ml',   'Малахія'),
]

# NT book IDs from the existing catholic.by seed (keep as-is)
NT_ID_MAP = {
    'mt':  'mt', 'mk': 'mk', 'lk': 'lk', 'jn': 'jn',
    'acts': 'acts', 'rom': 'rom', '1co': '1co', '2co': '2co',
    'gal': 'gal', 'eph': 'eph', 'php': 'php', 'col': 'col',
    '1th': '1th', '2th': '2th', '1ti': '1ti', '2ti': '2ti',
    'tit': 'tit', 'phm': 'phm', 'heb': 'heb', 'jas': 'jas',
    '1pe': '1pe', '2pe': '2pe', '1jn': '1jn', '2jn': '2jn',
    '3jn': '3jn', 'jud': 'jud', 'rev': 'rev',
}

# ── USFM parser ──────────────────────────────────────────────────────────────
_INLINE_TAGS = re.compile(r'\\[a-z+*]+\s*')

def _strip_inline(text: str) -> str:
    """Remove USFM inline markers like \add, \wj, \nd, \f ... \f*"""
    # Remove footnote blocks: \f ... \f*
    text = re.sub(r'\\f\s.*?\\f\*', '', text)
    # Remove cross-ref blocks: \x ... \x*
    text = re.sub(r'\\x\s.*?\\x\*', '', text)
    # Remove remaining \tag or \tag*
    text = _INLINE_TAGS.sub('', text)
    return text.strip()

def parse_usfm(path: pathlib.Path) -> list[list[str]]:
    """Parse a USFM file → list of chapters, each chapter = list of verse strings."""
    text = path.read_text(encoding='utf-8', errors='replace')
    chapters: list[list[str]] = []
    current_ch: list[str] = []
    verse_buf: list[str] = []

    def flush_verse():
        if verse_buf:
            v = ' '.join(verse_buf).strip()
            if v:
                current_ch.append(v)
            verse_buf.clear()

    in_verse = False
    for line in text.splitlines():
        line = line.rstrip()
        if line.startswith(r'\c '):
            # New chapter
            flush_verse()
            in_verse = False
            if current_ch:
                chapters.append(current_ch)
            current_ch = []
        elif line.startswith(r'\v '):
            flush_verse()
            in_verse = True
            # \v N text...
            parts = line.split(' ', 2)
            rest = parts[2] if len(parts) == 3 else ''
            rest = _strip_inline(rest)
            if rest:
                verse_buf.append(rest)
        elif in_verse:
            # Continuation line or paragraph marker
            stripped = line.strip()
            if stripped.startswith('\\'):
                # A block marker — might be paragraph break; strip the marker
                rest = re.sub(r'^\\[a-zA-Z0-9+*]+\s*', '', stripped)
                rest = _strip_inline(rest)
                if rest:
                    verse_buf.append(rest)
            else:
                rest = _strip_inline(stripped)
                if rest:
                    verse_buf.append(rest)

    flush_verse()
    if current_ch:
        chapters.append(current_ch)
    return chapters


def main():
    # ── 1. Load OT from USFM ───────────────────────────────────────────────
    print("=== OT from USFM (Boken translation) ===")
    ot_books = []
    for order_0, (usfm_code, book_id, bel_name) in enumerate(OT_BOOKS):
        # Find the file: e.g. 02-GENbel.usfm
        matches = list(USFM_DIR.glob(f'*-{usfm_code}bel.usfm'))
        if not matches:
            print(f"  MISSING: {usfm_code}  ({bel_name})")
            continue
        usfm_path = matches[0]
        chapters = parse_usfm(usfm_path)
        verse_count = sum(len(ch) for ch in chapters)
        print(f"  {order_0+1:2}. {book_id:5}  {bel_name:30}  {len(chapters):3} ch  {verse_count:5} v")
        ot_books.append({
            'id':       book_id,
            'name':     bel_name,
            'order':    order_0 + 1,
            'chapters': chapters,
        })

    # ── 2. Load NT from catholic.by seed ──────────────────────────────────
    print("\n=== NT from catholic.by ===")
    with gzip.open(NT_SEED) as f:
        nt_data = json.load(f)
    nt_src_books = nt_data['books']

    nt_books = []
    for src in nt_src_books:
        order_nt = len(OT_BOOKS) + len(nt_books) + 1
        verse_count = sum(len(ch) for ch in src['chapters'])
        print(f"  {order_nt:2}. {src['id']:6}  {src['name'][:35]:35}  {len(src['chapters']):3} ch  {verse_count:5} v")
        nt_books.append({
            'id':       src['id'],
            'name':     src['name'],
            'order':    order_nt,
            'chapters': src['chapters'],
        })

    # ── 3. Combine ─────────────────────────────────────────────────────────
    all_books = ot_books + nt_books
    total_verses = sum(len(ch) for b in all_books for ch in b['chapters'])
    print(f"\nTotal: {len(all_books)} books, {total_verses} verses")

    out = {'books': all_books}
    with gzip.open(OUT_JSON, 'wb') as f:
        f.write(json.dumps(out, ensure_ascii=False).encode('utf-8'))
    size = OUT_JSON.stat().st_size
    print(f"Wrote {OUT_JSON} ({size // 1024} KB)")

if __name__ == '__main__':
    main()
