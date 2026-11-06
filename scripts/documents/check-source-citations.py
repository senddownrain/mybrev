#!/usr/bin/env python3
"""Verify public bibliography against the supplied original DOCX, not prompt copies."""
from pathlib import Path
import json
import zipfile
import xml.etree.ElementTree as ET
root = Path(__file__).resolve().parents[2]
with zipfile.ZipFile(root / 'docs/sources/primary/jan-kremis-remarks-2026-11-02.docx') as archive:
    xml = ET.fromstring(archive.read('word/document.xml'))
ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
paragraphs = [''.join(p.itertext()).strip() for p in xml.findall('.//w:p', ns)]
entries = {e['id']: e for e in json.loads((root / 'src/data/sources.json').read_text())['entries']}
for id, quoted in [('bible-nt-kkbb-2017', True), ('lectionary-kkbb-2002-2005', True), ('compendium-kkbb-2010', False), ('liturgy-hours-2012-2020', False)]:
    e = entries[id]
    title = f'«{e["officialEdition"]}»' if quoted else e['officialEdition']
    citation = f'{title} ({e["publicationPlace"]}, {e["years"]})'
    assert citation in paragraphs, citation
    if e['rightsholder'] and id != 'liturgy-hours-2012-2020':
        assert e['copyrightNotices'][0] in paragraphs, e['copyrightNotices'][0]
assert entries['bible-nt-kkbb-2017']['translation']['label'] == 'Новы Запавет · ККББ, 2017'
for id in ['bible-charniauski-2017', 'bible-ru-synodal']:
    assert entries[id]['rightsholder'] is None
hours = entries['liturgy-hours-2012-2020']
assert hours['rightsholder'] == 'Канферэнцыя Каталіцкіх Біскупаў Беларусі'
assert hours['copyrightNotices'] == ['© Канферэнцыя Каталіцкіх Біскупаў Беларусі']
assert hours['copyrightNotices'][0] in (root / 'docs/sources/primary/kremis-final-remarks-2026-11-06.md').read_text()
assert entries['compendium-kkbb-2010']['copyrightNotices'] == ['© Канферэнцыя Каталіцкіх Біскупаў Беларусі, 2010']
legacy_notice = entries['compendium-kkbb-2010']['auditNotices'][0]['text']
assert legacy_notice in (root / 'scripts/compendium-source/3963-kampendyj-katekhizisa-katalitskaga-kastsjola.html').read_text()
print('DOCX: four citations and three notices verified; final remarks: Hours holder without unverified years; internal LEV provenance verified against original HTML')
