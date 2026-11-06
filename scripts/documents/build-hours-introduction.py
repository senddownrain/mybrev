#!/usr/bin/env python3
"""Build the complete, locally licensed Web article from the saved official text."""
import hashlib
import json
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[2]
SOURCE = 'docs/sources/primary/lh-introduction-2026-11-06.txt'
raw = (ROOT / SOURCE).read_text()
lines = raw.splitlines()
assert len(lines) == 712

# Line numbers refer to the immutable, complete article transcription, not HTML layout.
chapters = [(4, 133, 1, 33), (133, 273, 34, 99), (273, 482, 100, 203),
            (482, 604, 204, 252), (604, 674, 253, 284)]
subheadings = {
    14: 1, 24: 1, 29: 1, 38: 1, 41: 1, 48: 1, 55: 1, 59: 2,
    63: 1, 68: 2, 76: 1, 81: 1, 86: 1, 91: 1, 106: 1, 127: 1,
    354: 1, 362: 1, 389: 1, 435: 1, 461: 1, 468: 1,
    489: 1, 498: 1, 509: 1, 512: 1, 517: 1, 535: 1, 548: 1,
    554: 1, 558: 1, 568: 1, 575: 1, 582: 1, 588: 1, 592: 1,
}


def add_paragraph(blocks, text):
    # Source letters remain part of the text; no letters or punctuation are regenerated.
    if re.match(r'^[абвгдеёжзийклмнопрстуўфхцчшыьэюяa-z]\)\s', text):
        if not blocks or blocks[-1]['type'] != 'list':
            blocks.append({'type': 'list', 'items': []})
        blocks[-1]['items'].append(text)
    else:
        blocks.append({'type': 'paragraph', 'text': text})


result = []
numbers = []
for index, (start, end, first, last) in enumerate(chapters, 1):
    i = start  # skip the chapter's own label (1-based line => next zero-based index)
    while not lines[i]:
        i += 1
    title = []
    while i < end - 1 and lines[i] and lines[i].isupper():
        title.append(lines[i])
        i += 1
    chapter = {'id': f'chapter-{index}', 'label': lines[start - 1], 'title': ' '.join(title),
               'firstPoint': first, 'lastPoint': last, 'blocks': []}
    point = None
    while i < end - 1:
        text = lines[i]
        line = i + 1
        if not text:
            i += 1
            continue
        if text.isupper() or line in subheadings:
            point = None
            count = subheadings.get(line, 1)
            heading = lines[i:i + count]
            if line not in subheadings:
                while i + count < end - 1 and lines[i + count] and lines[i + count].isupper():
                    heading.append(lines[i + count])
                    count += 1
            chapter['blocks'].append({'type': 'heading', 'id': f'heading-{line}',
                                      'level': 4 if line in subheadings else 3,
                                      'text': ' '.join(heading)})
            i += count
            continue
        number = re.match(r'^(\d+)\.(?:\s+(.*))?$', text)
        if number:
            printed = int(number[1])
            canonical = 177 if line == 429 else printed
            assert canonical == len(numbers) + 1, (line, canonical, len(numbers))
            numbers.append(canonical)
            point = {'type': 'point', 'id': f'point-{canonical}', 'number': canonical,
                     'sourceNumber': printed, 'blocks': []}
            chapter['blocks'].append(point)
            if number[2]:
                add_paragraph(point['blocks'], number[2])
        elif line == 670:  # publisher's psalm-numbering note, after point 284
            point = None
            chapter['blocks'].append({'type': 'paragraph', 'text': text})
        else:
            assert point is not None, (line, text)
            add_paragraph(point['blocks'], text)
        i += 1
    assert [b['number'] for b in chapter['blocks'] if b['type'] == 'point'] == list(range(first, last + 1))
    result.append(chapter)

table = {'id': 'liturgical-days-table', 'title': lines[673], 'subtitle': ' '.join(lines[675:677]),
         'introduction': lines[678], 'groups': []}
entry = None
for text in lines[680:708]:
    if not text:
        continue
    if text.isupper():
        group = {'label': text, 'entries': []}
        table['groups'].append(group)
        continue
    match = re.match(r'^(\d+)\.\s+(.*)$', text)
    if match:
        entry = {'number': int(match[1]), 'text': match[2], 'subpoints': []}
        group['entries'].append(entry)
    else:
        assert entry is not None
        entry['subpoints'].append(text)
assert [e['number'] for g in table['groups'] for e in g['entries']] == list(range(1, 14))

data = {
    'title': 'Агульныя ўводзіны да Літургіі гадзінаў', 'officialTitle': ' '.join(lines[:2]),
    'publicationMode': 'full_text', 'sourceUrl': 'https://lh.catholic.by/uvodziny.php',
    'sourceFile': SOURCE, 'sourceSha256': hashlib.sha256(raw.encode()).hexdigest(),
    'permission': {'status': 'confirmed_by_project_owner', 'confirmedAt': '2026-11-06',
                   'evidence': 'docs/sources/primary/introduction-permission-2026-11-06.md'},
    'chapters': result, 'liturgicalDays': table,
    'precedence': {'id': 'precedence', 'title': lines[708], 'paragraphs': lines[710:712]},
    'editorialNotes': [{
        'id': 'numbering-note-177', 'point': 177,
        'text': 'У лічбавай крыніцы гэты пункт памылкова пазначаны нумарам 178. Тут адноўлена паслядоўная нумарацыя; тэкст пункта не зменены.',
        'verificationUrl': 'https://www.liturgyoffice.org.uk/Resources/Rites/GILH.pdf',
    }],
    'sources': [{'label': 'lh.catholic.by', 'url': 'https://lh.catholic.by/uvodziny.php'},
                {'label': 'Catholic.by', 'url': 'https://catholic.by/3/liturgy/liturgical-books/5913-agulnyya-vodziny-da-liturgii-gadzina'}],
}


def block_text(block):
    if block['type'] == 'list':
        return ' '.join(block['items'])
    if block['type'] == 'point':
        return str(block['sourceNumber']) + '. ' + ' '.join(map(block_text, block['blocks']))
    return block['text']


# Round trip the entire source: not just numbered points or selected chapter starts.
rendered = [data['officialTitle']]
for chapter in result:
    rendered.extend([chapter['label'], chapter['title'], *map(block_text, chapter['blocks'])])
rendered.extend([table['title'], table['subtitle'], table['introduction']])
for group in table['groups']:
    rendered.append(group['label'])
    for entry in group['entries']:
        rendered.extend([f"{entry['number']}. {entry['text']}", *entry['subpoints']])
rendered.extend([data['precedence']['title'], *data['precedence']['paragraphs']])
normalize = lambda text: re.sub(r'\s+', ' ', text).strip()
assert normalize(' '.join(rendered)) == normalize(raw), 'Full-source round trip failed'
assert numbers == list(range(1, 285))

encoded = json.dumps(data, ensure_ascii=False, indent=2) + '\n'
output = ROOT / 'src/data/documents/liturgy-hours-introduction.json'
if '--check' in sys.argv:
    assert output.read_text() == encoded, 'Introduction JSON differs from the complete primary text'
else:
    output.write_text(encoded)
print('Complete introduction: five chapters, 284 points, 13 table entries, both precedence paragraphs; full source round trip PASS')
