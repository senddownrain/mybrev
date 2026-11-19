#!/usr/bin/env python3
"""Offline commission DOCX export and strict, non-applying review checker."""
import argparse
import copy
import csv
import difflib
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime
from zoneinfo import ZoneInfo
from zipfile import BadZipFile, ZipFile

from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Pt
from lxml import etree

ROOT = Path(__file__).resolve().parents[2]
SEED = ROOT / 'src/data/songs.json'
FIELDS = ('title', 'text', 'chord', 'tag', 'tags', 'source')
LABELS = ('SONG_ID:', 'Назва:', 'Катэгорыі:', 'Дадатковыя тэгі:', 'Крыніца:',
          'Рашэнне камісіі:', 'Заўвагі камісіі:')
STATUSES = ('ПАКІНУЦЬ', 'ВЫКЛЮЧЫЦЬ', 'ВЫПРАВІЦЬ', 'АБМЕРКАВАЦЬ', 'НЕ ПРАВЕРАНА')
DEFAULT_LAYOUT = 'book'
sys.path.insert(0, str(Path(__file__).resolve().parent))
import book_layout
PREFIX = 'song-review-v1:'
WARNING = 'ЭТО НЕ ПОДТВЕРЖДЁННАЯ ПОЛНАЯ ВЕРСИЯ ДЛЯ КОМИССИИ'
RULES = '''Гэта працоўная, НЕ ЗАЦВЕРДЖАНАЯ рэдакцыя.
Можна змяняць назву, катэгорыі, тэгі, крыніцу, тэкст і акорды ў картках.
Катэгорыі і дадатковыя тэгі: адзін пункт — адзін абзац. Першая катэгорыя — асноўная.
Рашэнне камісіі: НЕ ПРАВЕРАНА / ПАКІНУЦЬ / ВЫКЛЮЧЫЦЬ / ВЫПРАВІЦЬ / АБМЕРКАВАЦЬ.
НЕ ПРАВЕРАНА азначае, што песня яшчэ не разгледжана.
Не выдаляйце картку цалкам і не змяняйце SONG_ID, нават калі песню трэба выключыць.
Не змяняйце подпісы тэхнічных палёў і структуру карткі. Заўвагі пішыце ў адпаведным полі.
Захоўвайце пустыя радкі і строфы. Тэкст і акорды рэдагуюцца ў асобных блоках.
Для новых строф націскайце Enter унутры блока; не выдаляйце подпісы і закладкі.
Блок акордаў можа змяшчаць словы прыпеваў — праверце яго цалкам.
Спрэчныя рашэнні пазначайце АБМЕРКАВАЦЬ. Каментарыі дазволены для абмеркавання.
Перад машыннай праверкай зрабіце асобную фінальную копію: прыміце або адхіліце ўсе адсочваныя змены.
Каментарыі не з'яўляюцца аўтаматычнымі ўказаннямі для імпарту.
Вярніце ўладальніку DOCX; PDF робіцца толькі пасля канчатковага зацвярджэння.'''


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True,
                                     separators=(',', ':'), allow_nan=False).encode()).hexdigest()


def write_json(path, value):
    Path(path).write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + '\n', encoding='utf-8')


def lf(value):
    return value.replace('\r\n', '\n').replace('\r', '\n')


def restore_visual_whitespace(old, new):
    """Writer trims paragraph-final spaces/tabs. Restore them on unchanged lines.

    Internal spaces (including chord alignment), indentation and line boundaries
    remain significant; a newly edited line retains exactly what was typed.
    """
    before, after = old.split('\n'), new.split('\n')
    matcher = difflib.SequenceMatcher(a=[s.rstrip(' \t') for s in before],
                                     b=[s.rstrip(' \t') for s in after], autojunk=False)
    for block in matcher.get_matching_blocks():
        after[block.b:block.b + block.size] = before[block.a:block.a + block.size]
    return '\n'.join(after)


def load_source(source=None, seed=SEED):
    result = subprocess.run(['node', str(ROOT / 'scripts/song-review-source.mjs'),
                             str(seed), str(source or seed)], capture_output=True, text=True, check=False)
    if result.returncode:
        raise ValueError(result.stderr.strip())
    return json.loads(result.stdout)


def category_values(value):
    if value is None or value == '':
        return []
    return value if isinstance(value, list) else str(value).split(',')


def category_names(song, categories):
    names = []
    for value in category_values(song.get('tag')):
        try:
            name = categories.get(int(str(value).strip()), f'Невядомая катэгорыя: {value}')
        except ValueError:
            name = f'Невядомая катэгорыя: {value}'
        if name not in names:
            names.append(name)
    return names


def view(song, categories):
    return {**{k: lf(song.get(k) or '') for k in ('title', 'text', 'chord', 'source')},
            'tag': category_names(song, categories), 'tags': [lf(t) for t in song.get('tags') or []]}


def validate_source(payload):
    report = payload['report']
    report.update(songCount=len(payload['rows']), unknownCategories=[], lineMismatches=[], legacyChordLyrics=[],
                  sourceMetadata=payload['provenance'])
    categories = {c['id']: c['title'] for c in payload['categories']}
    for song in payload['rows']:
        sid = song['id']
        for field in ('title', 'text', 'chord', 'source'):
            value = song.get(field, '')
            if value is not None and not isinstance(value, str):
                report['errors'].append(f'{sid}: {field} must be a string or null')
            elif isinstance(value, str) and re.search(r'[\x00-\x08\x0b\x0c\x0e-\x1f]', value):
                report['errors'].append(f'{sid}: {field} contains XML control characters')
        if not song.get('title') or not song.get('text'):
            report['missing'] += 1
            report['errors'].append(f'{sid}: missing title/text')
        if song.get('tags') is not None and (not isinstance(song['tags'], list)
                or any(not isinstance(t, str) for t in song['tags'])):
            report['errors'].append(f'{sid}: tags must be a string array')
        if report['errors']:
            continue
        for name in category_names(song, categories):
            if name not in categories.values():
                report['unknownCategories'].append({'id': sid, 'category': name})
        counts = {k: len(lf(song.get(k) or '').split('\n')) for k in ('text', 'chord')}
        if counts['text'] != counts['chord']:
            report['lineMismatches'].append({'id': sid, **counts})
        if re.search('[А-Яа-яІіЎўЁё]{3,}', song.get('chord') or ''):
            report['legacyChordLyrics'].append(sid)
    report['unknownCategoryCount'] = len(report['unknownCategories'])
    report['errorCount'] = len(report['errors'])
    report['completeForCommission'] = False  # Local evidence alone cannot certify current production.
    report['warning'] = WARNING if report['source'] == 'seed-only' else (
        'Снимок полон только на дату экспорта; владелец должен подтвердить его актуальность перед передачей комиссии.')
    return report


def title_key(title):
    alphabet = "абвгдеёжзійклмнопрстуўфхцчшыьэюя"
    ranks = {c: i for i, c in enumerate(alphabet)}
    # Explicit portable Belarusian order, independent of the machine's locale.
    return tuple((0, ranks[c]) if c in ranks else (1, ord(c))
                 for c in unicodedata.normalize('NFC', title.strip().casefold()))


def ordered(rows, categories):
    names = list(categories.values())
    def key(song):
        cats = category_names(song, categories)
        main = next((c for c in cats if c in names), 'Без катэгорыі')
        return (names.index(main) if main in names else len(names), title_key(song['title']), song['id'])
    return sorted(rows, key=key)


def cell_text(cell, value, style=None):
    cell.text = value
    if style:
        for p in cell.paragraphs:
            p.style = style


def cell_list(cell, values):
    cell.text = ''
    for i, value in enumerate(values):
        (cell.paragraphs[0] if i == 0 else cell.add_paragraph()).add_run(value)


def repeat_header(row):
    row._tr.get_or_add_trPr().append(OxmlElement('w:tblHeader'))


def add_bookmark(paragraph, name, number):
    bookmark = OxmlElement('w:bookmarkStart')
    bookmark.set(qn('w:id'), str(number))
    bookmark.set(qn('w:name'), name)
    paragraph._p.insert(0, bookmark)
    end = OxmlElement('w:bookmarkEnd')
    end.set(qn('w:id'), str(number))
    paragraph._p.append(end)


def field(paragraph, instruction):
    item = OxmlElement('w:fldSimple')
    item.set(qn('w:instr'), instruction)
    paragraph._p.append(item)


def export_docx(baseline, output):
    doc = Document()
    section = doc.sections[0]
    section.page_height, section.page_width = Cm(29.7), Cm(21)
    section.top_margin = section.bottom_margin = Cm(1.7)
    section.left_margin = section.right_margin = Cm(1.8)
    for name in ('Normal', 'Heading 1', 'Heading 2'):
        doc.styles[name].font.name = 'Times New Roman'
    normal = doc.styles['Normal']
    normal.font.size = Pt(12)
    normal.paragraph_format.space_after = Pt(2)
    normal.paragraph_format.line_spacing = 1.05
    doc.styles['Heading 1'].font.size = Pt(16)
    doc.styles['Heading 2'].font.size = Pt(13)
    doc.core_properties.identifier = 'song-review-v1:' + baseline['corpusHash']
    doc.add_heading('Спеўнік — працоўная рэдакцыя для разгляду камісіяй', 0)
    doc.add_paragraph(f"Дата: {baseline['exportedAt']}\nВерсія: {baseline['corpusHash']}\nКолькасць спеваў: {len(baseline['songs'])}")
    doc.add_paragraph(baseline['report']['warning']).runs[0].bold = True
    for line in RULES.splitlines():
        doc.add_paragraph(line)
    doc.add_page_break()
    doc.add_heading('Змест раздзелаў', 1)
    categories = {c['id']: c['title'] for c in baseline['categories']}
    groups = defaultdict(list)
    for song in ordered(baseline['songs'], categories):
        cats = category_names(song, categories)
        main = next((c for c in cats if c in categories.values()), 'Без катэгорыі')
        groups[main].append(song)
    for name, songs in groups.items():
        doc.add_paragraph(f'{name} — {len(songs)}')
    doc.add_paragraph('Нумары старонак можна абнавіць у Word: Ctrl+A → F9.')
    field(doc.add_paragraph(), 'TOC \\o "1-1" \\h \\z')
    count = 0
    for name, songs in groups.items():
        doc.add_heading(name, 1)
        for song in songs:
            count += 1
            data = view(song, categories)
            # One metadata table followed by one aligned line table; neither nested nor merged.
            table = doc.add_table(rows=7, cols=2)
            table.style = 'Table Grid'
            table.autofit = False
            table.columns[0].width, table.columns[1].width = Cm(4), Cm(13.4)
            caption = OxmlElement('w:tblCaption')
            caption.set(qn('w:val'), PREFIX + song['id'])
            table._tbl.tblPr.append(caption)
            values = [song['id'], data['title'], data['tag'], data['tags'], data['source'], STATUSES[0], '']
            for i, (label, value) in enumerate(zip(LABELS, values)):
                table.cell(i, 0).text = label
                if isinstance(value, list):
                    cell_list(table.cell(i, 1), value)
                else:
                    cell_text(table.cell(i, 1), value, 'Heading 2' if i == 1 else None)
                for p in table.cell(i, 0).paragraphs:
                    for run in p.runs:
                        run.bold = True
                # Keep compact metadata together, but let long lyric tables paginate.
                for cell in table.rows[i].cells:
                    for p in cell.paragraphs:
                        p.paragraph_format.keep_with_next = True
            table.cell(1, 0).text = f'Назва: № {count}'
            add_bookmark(table.cell(0, 1).paragraphs[0], 'sr_' + digest(song['id'])[:24], 2 * count)
            # A real separating paragraph stops Writer/Word merging adjacent tables.
            spacer = doc.add_paragraph()
            spacer.paragraph_format.space_after = Pt(0)
            spacer.paragraph_format.keep_with_next = True
            spacer.paragraph_format.line_spacing = Pt(1)
            spacer.add_run().font.size = Pt(1)
            lyrics = data['text'].split('\n')
            chords = data['chord'].split('\n')
            lines = doc.add_table(rows=1, cols=2)
            lines.style = 'Table Grid'
            lines.autofit = False
            lines.columns[0].width, lines.columns[1].width = Cm(10.2), Cm(7.2)
            cap = OxmlElement('w:tblCaption')
            cap.set(qn('w:val'), 'song-lines-v1:' + song['id'])
            lines._tbl.tblPr.append(cap)
            lines.cell(0, 0).text, lines.cell(0, 1).text = 'Тэкст', 'Акорды / дадатковыя радкі'
            add_bookmark(lines.cell(0, 0).paragraphs[0], 'sl_' + digest(song['id'])[:24], 2 * count + 1)
            repeat_header(lines.rows[0])
            for i in range(max(len(lyrics), len(chords))):
                row = lines.add_row()
                row.cells[0].text = lyrics[i] if i < len(lyrics) else ''
                row.cells[1].text = chords[i] if i < len(chords) else ''
            doc.add_paragraph()
    footer = section.footer.paragraphs[0]
    footer.alignment = 1
    footer.add_run('Працоўная рэдакцыя · ')
    field(footer, 'PAGE')
    doc.save(output)


def export(source, seed, out):
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    if (out / 'Speunik_dlia_kamisii.docx').exists() or (out / 'songs_review_baseline.json').exists():
        raise ValueError('Output already contains an export; choose a new --out to preserve the baseline')
    try:
        payload = load_source(source, seed)
    except (ValueError, OSError) as error:
        write_json(out / 'export_report.json', {'source': 'unavailable', 'songCount': 0, 'overrides': 0,
                   'missing': 0, 'duplicateIds': 0, 'unknownCategoryCount': 0,
                   'errorCount': 1, 'errors': [str(error)], 'completeForCommission': False})
        raise
    report = validate_source(payload)
    write_json(out / 'export_report.json', report)
    if report['errors']:
        raise ValueError('Invalid source; see export_report.json')
    songs = sorted(payload['rows'], key=lambda s: s['id'])
    report['corpusHash'] = digest(songs)
    commit = subprocess.run(['git', 'rev-parse', 'HEAD'], cwd=ROOT, capture_output=True, text=True)
    payload['provenance']['gitCommit'] = commit.stdout.strip() if commit.returncode == 0 else None
    write_json(out / 'export_report.json', report)
    baseline = {'schemaVersion': 1, 'exportedAt': datetime.now(ZoneInfo('Europe/Moscow')).isoformat(),
                'corpusHash': digest(songs), 'songs': songs, 'songHashes': {s['id']: digest(s) for s in songs},
                'categories': payload['categories'], 'provenance': payload['provenance'], 'report': report}
    baseline['baselineHash'] = digest(baseline)
    write_json(out / 'songs_review_baseline.json', baseline)
    if DEFAULT_LAYOUT == 'book':
        book_layout.export(baseline, out / 'Speunik_dlia_kamisii.docx', __import__("types").SimpleNamespace(**globals()))
    else:
        export_docx(baseline, out / 'Speunik_dlia_kamisii.docx')
    (out / 'README_dlia_kamisii.md').write_text('# Правілы працы\n\n' + report['warning'] + '\n\n' + RULES +
        '\n\nКамісіі перадаецца DOCX і гэтая памятка. Baseline захоўвае ўладальнік.\n', encoding='utf-8')
    groups = defaultdict(list)
    for song in songs:
        groups[unicodedata.normalize('NFC', song['title']).strip().casefold()].append(song['id'])
    with (out / 'potential_duplicates.csv').open('w', encoding='utf-8-sig', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['title', 'candidate_ids', 'action'])
        for title, ids in sorted(groups.items()):
            if len(ids) > 1:
                writer.writerow([title, ' | '.join(ids), 'manual review; no deletion'])
    if DEFAULT_LAYOUT == 'book':
        write_json(out / 'variant_candidates.json', [v for song in songs for v in book_layout.candidates(song, __import__('types').SimpleNamespace(**globals()))])
    return baseline


def verify_baseline(baseline):
    saved = baseline.get('baselineHash')
    unsigned = {k: v for k, v in baseline.items() if k != 'baselineHash'}
    if baseline.get('schemaVersion') != 1 or digest(unsigned) != saved:
        raise ValueError('Baseline schema/hash mismatch')
    songs = baseline['songs']
    ids = [s['id'] for s in songs]
    if len(ids) != len(set(ids)) or digest(songs) != baseline['corpusHash']:
        raise ValueError('Baseline corpus/IDs mismatch')
    if {s['id']: digest(s) for s in songs} != baseline['songHashes']:
        raise ValueError('Baseline song hash mismatch')


def read_xml(raw):
    parser = etree.XMLParser(resolve_entities=False, no_network=True, load_dtd=False)
    root = etree.fromstring(raw, parser)
    if root.getroottree().docinfo.doctype:
        raise ValueError('DOCTYPE is not supported in DOCX')
    return root


def xml_text(element):
    """Join text across runs/hyperlinks; paragraph and soft-break boundaries are content."""
    paragraphs = []
    for p in element.findall(qn('w:p')):
        parts = []
        for node in p.iter():
            if node.tag == qn('w:t'):
                parts.append(node.text or '')
            elif node.tag == qn('w:tab'):
                parts.append('\t')
            elif node.tag in (qn('w:br'), qn('w:cr')):
                if node.get(qn('w:type'), 'textWrapping') == 'textWrapping':
                    parts.append('\n')
            elif node.tag == qn('w:noBreakHyphen'):
                parts.append('\u2011')
            elif node.tag == qn('w:softHyphen'):
                parts.append('\u00ad')
        paragraphs.append(''.join(parts))
    return '\n'.join(paragraphs)


def cells(row, expected=2):
    result = row.findall(qn('w:tc'))
    if len(result) != expected:
        raise ValueError('Damaged row: expected two cells')
    for cell in result:
        if cell.find('.//' + qn('w:tbl')) is not None:
            raise ValueError('Nested table is ambiguous')
        for name in ('gridSpan', 'vMerge', 'hMerge'):
            if cell.find('.//' + qn('w:' + name)) is not None:
                raise ValueError('Merged cells are ambiguous')
    return result


def caption(table):
    cap = table.find('./' + qn('w:tblPr') + '/' + qn('w:tblCaption'))
    return cap.get(qn('w:val'), '') if cap is not None else ''


def parse_docx(path, baseline):
    errors, warnings, comments = [], [], []
    with ZipFile(path) as z:
        if len(z.namelist()) != len(set(z.namelist())):
            raise ValueError('Ambiguous duplicate ZIP members')
        if len(z.infolist()) > 3000 or sum(i.file_size for i in z.infolist()) > 128 * 1024 * 1024:
            raise ValueError('DOCX exceeds safety limits')
        core = read_xml(z.read('docProps/core.xml'))
        identifier = core.find('{http://purl.org/dc/elements/1.1/}identifier')
        if identifier is None or identifier.text != 'song-review-v1:' + baseline['corpusHash']:
            errors.append('Document/baseline version mismatch')
        root = None
        revision_tags = {'ins', 'del', 'moveFrom', 'moveTo', 'moveFromRangeStart', 'moveToRangeStart',
                         'cellIns', 'cellDel', 'cellMerge', 'numberingChange'}
        for name in z.namelist():
            if not name.startswith('word/') or not name.endswith('.xml'):
                continue
            part = read_xml(z.read(name))
            if name == 'word/document.xml':
                root = part
            for node in part.iter():
                local = etree.QName(node).localname
                if local in revision_tags or local.endswith('Change') or re.fullmatch(r'customXml(?:Ins|Del|MoveFrom|MoveTo)RangeStart', local):
                    errors.append(f'Unresolved Track Changes: {name} ({local})')
                if local == 'comment':
                    comments.append({'part': name, 'id': node.get(qn('w:id')), 'text': xml_text(node)})
        if root is None:
            raise ValueError('Missing word/document.xml')
    if core.find('{http://purl.org/dc/elements/1.1/}subject') is not None and core.find('{http://purl.org/dc/elements/1.1/}subject').text == 'song-review-book-v2':
        parsed, more_errors, warnings = book_layout.parse(root, baseline, __import__("types").SimpleNamespace(**globals()))
        return parsed, errors + more_errors, warnings, comments
    songs = {s['id']: s for s in baseline['songs']}
    categories = {c['id']: c['title'] for c in baseline['categories']}
    reverse = {v: k for k, v in categories.items()}
    body = root.find(qn('w:body'))
    if body is None:
        raise ValueError('Missing document body')
    tables = body.findall(qn('w:tbl'))
    inside_cards = False
    for child in body:
        if child.tag == qn('w:tbl'):
            inside_cards = True
        elif inside_cards and child.tag == qn('w:p') and xml_text_wrapper(child):
            style = child.find('./' + qn('w:pPr') + '/' + qn('w:pStyle'))
            section_names = {c['title'] for c in baseline['categories']} | {'Без катэгорыі'}
            if (style is None or style.get(qn('w:val')) != 'Heading1'
                    or xml_text_wrapper(child) not in section_names):
                errors.append('Unassigned text outside song cards')
    result = {}
    marker_ids = {'sr_' + digest(sid)[:24]: sid for sid in songs}
    if len(tables) != 2 * len(songs):
        errors.append(f'Song table count mismatch: expected {2 * len(songs)}, found {len(tables)}')
    for i in range(0, len(tables), 2):
        table = tables[i]
        markers = [n.get(qn('w:name')) for n in table.iter(qn('w:bookmarkStart'))
                   if n.get(qn('w:name'), '').startswith('sr_')]
        sid = marker_ids.get(markers[0], '') if len(markers) == 1 else ''
        try:
            if sid not in songs or (caption(table) and caption(table) != PREFIX + sid):
                raise ValueError(f'Unknown/missing structural SONG_ID: {sid}')
            if sid in result:
                raise ValueError(f'Duplicate SONG_ID: {sid}')
            rows = table.findall(qn('w:tr'))
            if len(rows) != 7:
                raise ValueError('Incomplete metadata block')
            values = []
            value_cells = []
            for j, row in enumerate(rows):
                label_cell, value_cell = cells(row)
                label = xml_text(label_cell)
                if (j == 1 and not re.fullmatch(r'Назва: № \d+', label)) or (j != 1 and label != LABELS[j]):
                    raise ValueError(f'Changed/ambiguous field label: {label}')
                value_cells.append(value_cell)
                values.append(xml_text(value_cell))
            if values[0] != sid:
                raise ValueError(f'Changed visible SONG_ID: {values[0]} (expected {sid})')
            bookmarks = [n.get(qn('w:name')) for n in value_cells[0].iter(qn('w:bookmarkStart'))]
            if [b for b in bookmarks if b.startswith('sr_')] != ['sr_' + digest(sid)[:24]]:
                raise ValueError('Missing/changed ID bookmark')
            if values[5] not in STATUSES:
                raise ValueError(f'Unknown decision: {values[5]}')
            if i + 1 >= len(tables):
                raise ValueError('Missing/mismatched line table')
            line_table = tables[i + 1]
            if caption(line_table) and caption(line_table) != 'song-lines-v1:' + sid:
                raise ValueError('Mismatched line table caption')
            line_markers = [n.get(qn('w:name')) for n in line_table.iter(qn('w:bookmarkStart'))
                            if n.get(qn('w:name'), '').startswith('sl_')]
            if line_markers != ['sl_' + digest(sid)[:24]]:
                raise ValueError('Missing/mismatched line table bookmark')
            line_rows = line_table.findall(qn('w:tr'))
            if len(line_rows) < 2 or [xml_text(c) for c in cells(line_rows[0])] != ['Тэкст', 'Акорды / дадатковыя радкі']:
                raise ValueError('Missing/damaged line table header/content')
            data = {'title': values[1], 'source': values[4]}
            old_view = view(songs[sid], categories)
            for key, index in [('tag', 2), ('tags', 3)]:
                ps = value_cells[index].findall(qn('w:p'))
                items = [xml_text_wrapper(p) for p in ps]
                data[key] = [] if items == [''] and old_view[key] != [''] else items
            if data['tag'] != old_view['tag']:
                if any(t not in reverse for t in data['tag']):
                    raise ValueError('Unknown edited category')
                if len(set(data['tag'])) != len(data['tag']):
                    raise ValueError('Duplicate category')
            columns = [[], []]
            for row in line_rows[1:]:
                a, b = [xml_text(c).split('\n') for c in cells(row)]
                if len(a) != len(b) and max(len(a), len(b)) > 1:
                    raise ValueError('Multiline cell alignment is ambiguous; insert table rows instead')
                columns[0].extend(a)
                columns[1].extend(b)
            original_max = max(len(old_view[k].split('\n')) for k in ('text', 'chord'))
            for key, column in zip(('text', 'chord'), columns):
                original_count = len(old_view[key].split('\n'))
                # Remove only the known export padding; preserve original final empty lines.
                if len(column) == original_max and original_count < original_max and not any(column[original_count:]):
                    column = column[:original_count]
                data[key] = '\n'.join(column)
                data[key] = restore_visual_whitespace(old_view[key], data[key])
                count = len(column)
                if count != original_count:
                    warnings.append({'id': sid, 'field': key, 'oldLines': original_count, 'newLines': count})
            if not data['title'].strip() or not data['text'].strip():
                raise ValueError('Empty title/text')
            new = copy.deepcopy(songs[sid])
            for key in FIELDS:
                if data[key] != old_view[key]:
                    new[key] = [reverse[t] for t in data[key]] if key == 'tag' else data[key]
            result[sid] = {'song': new, 'decision': values[5], 'notes': values[6]}
        except (ValueError, IndexError) as error:
            errors.append(f'{sid or "block " + str(i // 2 + 1)}: {error}')
    for sid in songs.keys() - result.keys():
        errors.append(f'Missing/incomplete song block: {sid}')
    # Unsupported objects can contain invisible alternative text/fields; never silently discard them.
    unsupported = {'altChunk', 'txbxContent', 'drawing', 'object', 'sdt', 'fldSimple', 'instrText', 'sym',
                   'footnoteReference', 'endnoteReference', 'oMath', 'oMathPara', 'contentPart', 'subDoc', 'delText', 'numPr'}
    for table in tables:
        for node in table.iter():
            if etree.QName(node).localname in unsupported:
                errors.append(f'Unsupported content inside song card: {etree.QName(node).localname}')
    return result, errors, warnings, comments


def xml_text_wrapper(paragraph):
    wrapper = etree.Element('wrapper')
    wrapper.append(copy.deepcopy(paragraph))
    return xml_text(wrapper)


def check(input_path, baseline_path, out, current_source=None, seed=None):
    out = Path(out)
    out.mkdir(parents=True, exist_ok=True)
    report = {'mode': 'dry-run', 'applicable': False, 'errors': [], 'conflicts': [], 'changes': [],
              'decisions': dict.fromkeys(STATUSES, 0), 'lineWarnings': [], 'comments': []}
    try:
        baseline = json.loads(Path(baseline_path).read_text(encoding='utf-8'))
        verify_baseline(baseline)
        report['baselineHash'] = baseline['baselineHash']
        parsed, errors, warnings, comments = parse_docx(input_path, baseline)
        report.update(errors=errors, lineWarnings=warnings, comments=comments, parsedSongs=len(parsed))
        old = {s['id']: s for s in baseline['songs']}
        report['expectedSongs'] = len(old)
        for sid, entry in parsed.items():
            report['decisions'][entry['decision']] += 1
            changed = {k: {'old': old[sid].get(k), 'new': entry['song'].get(k)} for k in FIELDS
                       if old[sid].get(k) != entry['song'].get(k)}
            report['changes'].append({'id': sid, 'decision': entry['decision'], 'notes': entry['notes'], 'fields': changed, 'variants': entry.get('variants', [])})
        source = current_source or baseline['provenance']['source']
        current = load_source(source, seed or SEED)
        current_report = validate_source(current)
        if current_report['errors']:
            report['errors'].extend(current_report['errors'])
        report['currentSource'] = current['provenance']
        now = {s['id']: s for s in current['rows']}
        for sid in sorted(old.keys() | now.keys()):
            if old.get(sid) != now.get(sid):
                report['conflicts'].append({'id': sid, 'baseline': old.get(sid), 'current': now.get(sid)})
    except (ValueError, OSError, KeyError, TypeError, BadZipFile, etree.XMLSyntaxError) as error:
        report['errors'].append(str(error))
    report['changedSongs'] = sum(bool(c['fields']) for c in report['changes'])
    report['fieldChanges'] = dict(Counter(k for c in report['changes'] for k in c['fields']))
    report['incompleteBlocks'] = sum('Missing/incomplete song block:' in e for e in report['errors'])
    report['blocked'] = bool(report['errors'] or report['conflicts'] or report['decisions']['АБМЕРКАВАЦЬ'])
    report['unreviewedIds'] = [c['id'] for c in report['changes'] if c['decision'] == 'НЕ ПРАВЕРАНА']
    report['variantReviews'] = [v for c in report['changes'] for v in c.get('variants', [])]
    report['revisionComplete'] = not report['blocked'] and not report['unreviewedIds'] and not any(not v['boundaryConfirmed'] or v['decision'] in ['НЕ ПРАВЕРАНА', 'АБМЕРКАВАЦЬ'] or v['anchorDrift'] for v in report['variantReviews'])
    report['blocked'] = report['blocked'] or not report['revisionComplete']
    report['approvalRequired'] = True
    write_json(out / 'review_diff.json', report)
    lines = ['# Праверка рэвізіі — толькі dry-run', '',
             f"Змененыя спевы: {report['changedSongs']}; канфлікты: {len(report['conflicts'])}; памылкі: {len(report['errors'])}.",
             f"Няпоўныя карткі: {report['incompleteBlocks']}. Папярэджанні пра радкі: {len(report['lineWarnings'])}.",
             f"Блакіроўка: {report['blocked']}. Патрабуецца асобнае зацвярджэнне diff і выключэнняў. Нічога не ўжыта.", '']
    lines += [f'- {k}: {v}' for k, v in report['decisions'].items()]
    lines += ['', '## Памылкі', ''] + [f'- {e}' for e in report['errors']]
    lines += ['', '## Канфлікты крыніцы', ''] + [f"- {c['id']}" for c in report['conflicts']]
    lines += ['', '## Змены па ID', '']
    for item in report['changes']:
        if item['fields'] or item['notes'] or item['decision'] != STATUSES[0]:
            lines += [f"- {item['id']}: {item['decision']}; палі: {', '.join(item['fields']) or 'без змен'}; заўвагі: {item['notes']}"]
    lines += ['', f"Не праверана: {len(report['unreviewedIds'])}; кандыдаты: {len(report['variantReviews'])}; рэвізія завершана: {report['revisionComplete']}"]
    lines += [f"- {v['parentSongId']} / {v['key']}: {v['decision']}; заўвагі: {v['notes']}; межы пацверджаны: {v['boundaryConfirmed']}; дрэйф: {v['anchorDrift']}" for v in report['variantReviews']]
    lines += ['', 'Поўныя старыя/новыя значэнні, радкі і каментарыі: review_diff.json.']
    (out / 'review_summary.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    return report


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    exp = sub.add_parser('export')
    exp.add_argument('--source', help='Local song JSON array or verified snapshot directory; defaults to seed')
    exp.add_argument('--seed', type=Path, default=SEED)
    exp.add_argument('--out', default='out/songbook-review/' + datetime.now(ZoneInfo('Europe/Moscow')).strftime('%Y-%m-%d_%H%M%S'))
    chk = sub.add_parser('check')
    chk.add_argument('--input', required=True)
    chk.add_argument('--baseline', required=True)
    chk.add_argument('--current-source', help='Current local JSON/snapshot for drift detection; defaults to baseline source path')
    chk.add_argument('--seed', type=Path, default=SEED)
    chk.add_argument('--out', default='out/songbook-review/check')
    args = parser.parse_args()
    try:
        if args.command == 'export':
            baseline = export(args.source, args.seed, args.out)
            report = baseline['report']
            print(json.dumps({k: report[k] for k in ('source', 'songCount', 'overrides', 'additions',
                             'missing', 'duplicateIds', 'unknownCategoryCount', 'errorCount', 'warning')},
                             ensure_ascii=False, indent=2))
            print(f'lineMismatches={len(report["lineMismatches"])} legacyChordLyrics={len(report["legacyChordLyrics"])}')
            print(f'Word: {Path(args.out).resolve() / "Speunik_dlia_kamisii.docx"}')
        else:
            report = check(args.input, args.baseline, args.out, args.current_source, args.seed)
            print(json.dumps({k: report[k] for k in ('mode', 'blocked', 'changedSongs', 'decisions', 'fieldChanges', 'incompleteBlocks')}, ensure_ascii=False))
            print(f'errors={len(report["errors"])} conflicts={len(report["conflicts"])}; {Path(args.out).resolve()}')
            return 2 if report['blocked'] else 0
    except (ValueError, OSError) as error:
        print(f'ERROR: {error}', file=sys.stderr)
        return 2
    return 0


if __name__ == '__main__':
    sys.exit(main())
