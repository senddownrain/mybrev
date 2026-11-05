#!/usr/bin/env python3
"""Build only the static document. Requires PyMuPDF; never reads application calendar data.

Position-aware extraction: merge PDF baselines, retain span color/italic/small caps,
separate the printed date and right-hand rank. Review all pages visually after changes.
Whitespace for layout is normalized; visible letters and punctuation are not corrected.
"""
from pathlib import Path
from collections import Counter
import hashlib
import json
import re
import sys
import fitz

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'public/documents/proper-calendar.pdf'
OUTPUT = ROOT / 'src/data/documents/proper-calendar.json'
MONTHS = ['СТУДЗЕНЬ', 'ЛЮТЫ', 'САКАВІК', 'КРАСАВІК', 'МАЙ', 'ЧЭРВЕНЬ', 'ЛІПЕНЬ', 'ЖНІВЕНЬ', 'ВЕРАСЕНЬ', 'КАСТРЫЧНІК', 'ЛІСТАПАД', 'СНЕЖАНЬ']

def runs(spans):
    result = []
    for span in spans:
        text = re.sub(r'\s+', ' ', span['text'])
        if not text:
            continue
        item = dict(text=text, tone={0: 'ink', 0xff0000: 'red', 0xff00ff: 'magenta'}[span['color']], italic='Italic' in span['font'], small=span['size'] < 10, bold='Bold' in span['font'])
        if result and all(result[-1][k] == item[k] for k in item if k != 'text'):
            result[-1]['text'] += text
        else:
            result.append(item)
    while result and not result[0]['text'].strip(): result.pop(0)
    while result and not result[-1]['text'].strip(): result.pop()
    if result:
        result[0]['text'] = result[0]['text'].lstrip()
        result[-1]['text'] = result[-1]['text'].rstrip()
    return result

pages = []
source_characters = Counter()
month = None
pdf = fitz.open(SOURCE)
for index, page in enumerate(pdf):
    baselines = []
    for block in page.get_text('rawdict')['blocks']:
        for line in block.get('lines', []):
            for span in line['spans']:
                span['text'] = ''.join(char['c'] for char in span['chars'])
                span['inkX'] = next((char['bbox'][0] for char in span['chars'] if char['c'].strip()), span['bbox'][0])
            if not ''.join(s['text'] for s in line['spans']).strip(): continue
            # Page numerals are running furniture, not calendar entries.
            if line['bbox'][0] > 500 and line['bbox'][1] < 55: continue
            y = max(s['origin'][1] for s in line['spans'])
            match = next((row for row in baselines if abs(row['baseline'] - y) < 1), None)
            if match is None:
                match = dict(baseline=y, spans=[])
                baselines.append(match)
            match['spans'].extend(line['spans'])
    rows = []
    for line in sorted(baselines, key=lambda row: row['baseline']):
        spans = sorted(line['spans'], key=lambda s: s['bbox'][0])
        text = ''.join(s['text'] for s in spans).strip()
        if index == 0 and text.startswith('УЛАСНЫ КАЛЯНДАР'): continue
        source_characters.update(re.sub(r'\s+', '', text))
        if text in MONTHS:
            month = MONTHS.index(text) + 1
            rows.append(dict(kind='month', month=month, text=text))
            continue
        rank_start = next((i for i, s in enumerate(spans) if s['bbox'][0] >= 380 and re.match(r'^(Успамін|Свята|Урачыстасць)', s['text'])), len(spans))
        body = spans[:rank_start]
        rank = runs(spans[rank_start:])
        content = runs(body)
        date, date_tone = None, None
        if content:
            match = re.match(r'^(\d{1,2})\.\s*', ''.join(run['text'] for run in content))
            if match:
                date = int(match[1]); date_tone = content[0]['tone']
                remaining = match.end()
                while remaining and content:
                    removed = min(remaining, len(content[0]['text']))
                    content[0]['text'] = content[0]['text'][removed:]
                    remaining -= removed
                    if not content[0]['text']: content.pop(0)
        kind = 'intro' if month is None else 'note' if text.startswith('Калі не пазначана') else 'line'
        rows.append(dict(kind=kind, month=month, date=date, dateTone=date_tone, indent=bool(body and next((s['inkX'] for s in body if s['text'].strip()), 0) > 80), runs=content, rank=rank))
    pages.append(dict(number=index + 1, rows=rows))

result = dict(title='Уласны каляндар дыяцэзій на Беларусі', sourceTitle='УЛАСНЫ КАЛЯНДАР ДЫЯЦЭЗІЙ НА БЕЛАРУСІ', sourceFile='/documents/proper-calendar.pdf', sourceSha256=hashlib.sha256(SOURCE.read_bytes()).hexdigest(), months=[dict(id=f'month-{i+1}', title=m, number=i+1) for i,m in enumerate(MONTHS)], pages=pages)
article_characters = Counter()
for page in pages:
    for row in page['rows']:
        text = row['text'] if row['kind'] == 'month' else (str(row['date']) + '.' if row['date'] else '') + ''.join(r['text'] for r in row['runs'] + row['rank'])
        article_characters.update(re.sub(r'\s+', '', text))
assert article_characters == source_characters, 'Visible PDF characters lost or invented'
result['visibleCharacterCount'] = sum(article_characters.values())
encoded = json.dumps(result, ensure_ascii=False, indent=2) + '\n'
if '--check' in sys.argv:
    assert OUTPUT.read_text() == encoded, 'Calendar document differs; regenerate and visually compare all 13 pages.'
else:
    OUTPUT.write_text(encoded)
print('Static calendar:', len(pages), 'pages,', sum(len(p['rows']) for p in pages), 'rows,', sum(r.get('date') is not None for p in pages for r in p['rows']), 'printed dates')
