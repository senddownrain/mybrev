"""Real-corpus round trip and adversarial OOXML mutations; no network or database."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import shutil
import tempfile
import unittest
from zipfile import ZipFile, ZIP_DEFLATED

from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('review', ROOT / 'scripts/song-review/review.py')
r = importlib.util.module_from_spec(spec)
spec.loader.exec_module(r)


class SongReviewTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        scratch = ROOT / 'work/song-review-tests'
        scratch.mkdir(parents=True, exist_ok=True)
        cls.temp = tempfile.TemporaryDirectory(dir=scratch)
        cls.root = Path(cls.temp.name)
        cls.source = cls.root / 'songs.json'
        cls.rows = [
            {'id': 'stable-ў-1', 'title': 'Імя — «Ў»', 'text': 'Першы\r\n\r\nДругі\n\n',
             'chord': 'C♯ H\r\nПрыпеў: хвала!\n\n', 'tag': [2, 3], 'tags': ['супольны', 'café'],
             'source': 'Крыніца', 'updatedAt': {'__firestoreType': 'timestamp', 'seconds': 1, 'nanoseconds': 0}},
            {'id': 'stable-2', 'title': 'Імя — «Ў»', 'text': '\nстрофа  \n\nканец\t\n', 'chord': '',
             'tag': [], 'tags': [], 'source': ''},
            {'id': 'stable-3', 'title': 'Ёлка', 'text': 'слова\rканец', 'tag': '1,6',
             'tags': ['тэг\r\nпрацяг'], 'source': None},
        ]
        r.write_json(cls.source, cls.rows)
        cls.export_dir = cls.root / 'export'
        cls.baseline = r.export(cls.source, r.SEED, cls.export_dir)
        cls.docx = cls.export_dir / 'Speunik_dlia_kamisii.docx'
        cls.base = cls.export_dir / 'songs_review_baseline.json'

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def run_check(self, mutate=None, current=None):
        with tempfile.TemporaryDirectory(dir=self.root) as td:
            td = Path(td)
            path = self.docx
            if mutate:
                doc = Document(self.docx)
                mutate(doc)
                path = td / 'reviewed.docx'
                doc.save(path)
            return r.check(path, self.base, td / 'check', current_source=current or self.source)

    def card(self, doc, sid='stable-ў-1'):
        return next(t for t in doc.tables if r.caption(t._tbl) == r.PREFIX + sid)

    def lines(self, doc, sid='stable-ў-1'):
        return next(t for t in doc.tables if r.caption(t._tbl) == 'song-lines-v1:' + sid)

    def test_round_trip_exact_all_fields_and_endings(self):
        report = self.run_check()
        self.assertFalse(report['blocked'], report['errors'])
        self.assertEqual(report['changedSongs'], 0)
        parsed, errors, _, _ = r.parse_docx(self.docx, self.baseline)
        self.assertEqual(errors, [])
        self.assertEqual({k: x['song'] for k, x in parsed.items()}, {s['id']: s for s in self.rows})

    def test_all_real_songs(self):
        baseline = r.export(r.SEED, r.SEED, self.root / 'real')
        parsed, errors, _, _ = r.parse_docx(self.root / 'real/Speunik_dlia_kamisii.docx', baseline)
        seed = json.loads(r.SEED.read_text())
        self.assertEqual(errors, [])
        self.assertEqual(len(parsed), len(seed))
        self.assertEqual({sid: x['song'] for sid, x in parsed.items()}, {s['id']: s for s in seed})
        self.assertEqual(baseline['report']['source'], 'seed-only')
        self.assertIn(r.WARNING, (self.root / 'real/README_dlia_kamisii.md').read_text())
        self.assertGreater(len(baseline['report']['legacyChordLyrics']), 0)

    def test_deterministic_logical_export(self):
        other = r.export(self.source, r.SEED, self.root / 'repeat')
        for key in ['songs', 'songHashes', 'corpusHash', 'categories']:
            self.assertEqual(other[key], self.baseline[key])

    def test_individual_field_edits(self):
        for field, row in [('title', 1), ('source', 4)]:
            with self.subTest(field=field):
                report = self.run_check(lambda d: setattr(self.card(d).cell(row, 1), 'text', 'Новая назва'))
                self.assertFalse(report['blocked'], report['errors'])
                self.assertEqual(report['fieldChanges'], {field: 1})
        for field, col in [('text', 0), ('chord', 1)]:
            with self.subTest(field=field):
                report = self.run_check(lambda d: setattr(self.lines(d).cell(1, col), 'text', 'Новы радок'))
                self.assertFalse(report['blocked'], report['errors'])
                self.assertEqual(report['fieldChanges'], {field: 1})

    def test_categories_and_tags_are_human_editable(self):
        def mutate(d):
            self.card(d).cell(2, 1).text = 'Марыйныя'
            r.cell_list(self.card(d).cell(3, 1), ['новы', 'іншы'])
        report = self.run_check(mutate)
        self.assertFalse(report['blocked'], report['errors'])
        change = next(c for c in report['changes'] if c['id'] == 'stable-ў-1')
        self.assertEqual(change['fields']['tag']['new'], [6])
        self.assertEqual(change['fields']['tags']['new'], ['новы', 'іншы'])

    def test_categories_and_tags_can_be_cleared(self):
        def mutate(d):
            self.card(d).cell(2, 1).text = ''
            self.card(d).cell(3, 1).text = ''
        report = self.run_check(mutate)
        self.assertFalse(report['blocked'], report['errors'])
        change = next(c for c in report['changes'] if c['id'] == 'stable-ў-1')
        self.assertEqual(change['fields']['tag']['new'], [])
        self.assertEqual(change['fields']['tags']['new'], [])

    def test_status_exclude_and_notes(self):
        def mutate(d):
            self.card(d).cell(5, 1).text = 'ВЫКЛЮЧЫЦЬ'
            self.card(d).cell(6, 1).text = 'Прычына'
        report = self.run_check(mutate)
        self.assertFalse(report['blocked'], report['errors'])
        self.assertFalse(report['applicable'])
        self.assertEqual(report['decisions']['ВЫКЛЮЧЫЦЬ'], 1)
        self.assertEqual(report['changedSongs'], 0)

    def test_discuss_and_unknown_status_block(self):
        for status in ['АБМЕРКАВАЦЬ', 'НЕ ВЕДАЮ']:
            self.assertTrue(self.run_check(lambda d: setattr(self.card(d).cell(5, 1), 'text', status))['blocked'])

    def test_visual_run_changes_have_zero_diff(self):
        def mutate(d):
            cell = self.lines(d).cell(1, 0)
            text = cell.text
            cell.text = ''
            p = cell.paragraphs[0]
            p.add_run(text[:3]).bold = True
            p.add_run(text[3:]).italic = True
        report = self.run_check(mutate)
        self.assertFalse(report['blocked'], report['errors'])
        self.assertEqual(report['changedSongs'], 0)

    def test_visual_trailing_whitespace_is_restored_exactly(self):
        def mutate(d):
            for row in self.lines(d, 'stable-2').rows[1:]:
                row.cells[0].text = row.cells[0].text.rstrip(' \t')
        report = self.run_check(mutate)
        self.assertFalse(report['blocked'], report['errors'])
        self.assertEqual(report['changedSongs'], 0)

    @unittest.skipUnless(shutil.which('soffice'), 'LibreOffice unavailable; use manual checklist')
    def test_libreoffice_resave_all_real_songs(self):
        # A real editor must preserve logical content, bookmarks, empty lines and decisions.
        base = self.root / 'real/songs_review_baseline.json'
        if not base.exists(): r.export(r.SEED, r.SEED, self.root / 'real')
        out = self.root / 'libreoffice'
        out.mkdir()
        process = subprocess.run(['soffice', '--headless', '--convert-to', 'docx:Office Open XML Text',
                                  '--outdir', str(out), str(self.root / 'real/Speunik_dlia_kamisii.docx')],
                                 capture_output=True, timeout=60)
        self.assertEqual(process.returncode, 0, process.stderr)
        report = r.check(out / 'Speunik_dlia_kamisii.docx', base, out / 'check', current_source=r.SEED)
        self.assertFalse(report['blocked'], report['errors'][:5])
        self.assertEqual(report['changedSongs'], 0)
        self.assertEqual(report['decisions']['ПАКІНУЦЬ'], len(json.loads(r.SEED.read_text())))

    def test_added_aligned_rows_warn(self):
        def mutate(d):
            row = self.lines(d).add_row()
            row.cells[0].text = 'Новая страфа'
            row.cells[1].text = 'Am'
        report = self.run_check(mutate)
        self.assertFalse(report['blocked'], report['errors'])
        self.assertEqual({w['field'] for w in report['lineWarnings']}, {'text', 'chord'})

    def test_damaged_visible_id(self):
        for value in ['', 'changed', 'stable-2']:
            report = self.run_check(lambda d: setattr(self.card(d).cell(0, 1), 'text', value))
            self.assertTrue(report['blocked'])

    def test_missing_card_or_duplicate_card(self):
        def remove(d):
            card = self.card(d)._tbl
            card.getparent().remove(card)
        def duplicate(d):
            body = d._element.body
            body.insert(-1, copy.deepcopy(self.card(d)._tbl))
            body.insert(-1, copy.deepcopy(self.lines(d)._tbl))
        for mutation in [remove, duplicate]:
            report = self.run_check(mutation)
            self.assertTrue(report['blocked'])

    def test_missing_bookmark_caption_and_metadata(self):
        def bookmark(d):
            node = self.card(d)._tbl.find('.//' + qn('w:bookmarkStart'))
            node.getparent().remove(node)
        def caption(d):
            node = self.card(d)._tbl.tblPr.find(qn('w:tblCaption'))
            node.getparent().remove(node)
        def row(d):
            self.card(d)._tbl.remove(self.card(d).rows[3]._tr)
        for mutation in [bookmark, row]:
            self.assertTrue(self.run_check(mutation)['blocked'])
        self.assertFalse(self.run_check(caption)['blocked'])  # Writer drops optional captions.

    def test_ambiguous_labels_merged_cells_and_newlines(self):
        def label(d):
            self.card(d).cell(4, 0).text = 'Назва:'
        def merge(d):
            self.lines(d).cell(1, 0).merge(self.lines(d).cell(1, 1))
        def newline(d):
            self.lines(d).cell(1, 0).text = 'Адзін\nДва'
        for mutation in [label, merge, newline]:
            self.assertTrue(self.run_check(mutation)['blocked'])

    def test_unresolved_track_changes(self):
        for tag in ['ins', 'del', 'moveFrom', 'rPrChange', 'tblGridChange', 'cellDel']:
            def mutate(d):
                d.paragraphs[0]._p.append(OxmlElement('w:' + tag))
            with self.subTest(tag=tag):
                self.assertTrue(self.run_check(mutate)['blocked'])

    def test_comments_are_reported_not_applied(self):
        def mutate(d):
            d.add_comment(self.card(d).cell(1, 1).paragraphs[0].runs, 'Выключыць?', author='Камісія')
        report = self.run_check(mutate)
        self.assertFalse(report['blocked'], report['errors'])
        self.assertEqual(report['changedSongs'], 0)
        self.assertEqual(report['comments'][0]['text'], 'Выключыць?')

    def test_source_drift_including_added_or_missing_songs(self):
        for mode in ['changed', 'added', 'removed', 'metadata']:
            current = copy.deepcopy(self.rows)
            if mode == 'changed': current[0]['title'] = 'Новая ў базе'
            if mode == 'metadata': current[0]['updatedAt']['seconds'] = 2
            if mode == 'added': current.append({**current[0], 'id': 'new'})
            if mode == 'removed': current.pop()
            path = self.root / f'{mode}.json'
            r.write_json(path, current)
            report = self.run_check(current=path)
            self.assertTrue(report['blocked'])
            self.assertEqual(len(report['conflicts']), 1)

    def test_unknown_original_category_preserved_and_reported(self):
        path = self.root / 'unknown.json'
        rows = [{**self.rows[0], 'tag': [999]}]
        r.write_json(path, rows)
        baseline = r.export(path, r.SEED, self.root / 'unknown')
        parsed, errors, _, _ = r.parse_docx(self.root / 'unknown/Speunik_dlia_kamisii.docx', baseline)
        self.assertEqual(errors, [])
        self.assertEqual(parsed[rows[0]['id']]['song'], rows[0])
        self.assertEqual(baseline['report']['unknownCategoryCount'], 1)

    def test_snapshot_merge_matches_web_and_checks_integrity(self):
        snapshot = self.root / 'snapshot'
        snapshot.mkdir()
        payload = {'schemaVersion': 1, 'collectionPath': 'songs', 'documents': [
            {'id': self.rows[0]['id'], 'data': {'title': 'Змененая', 'id': 'wrong-field-id'}},
            {'id': 'new', 'data': {'title': 'Новая', 'text': 'Тэкст'}},
        ]}
        r.write_json(snapshot / 'songs.json', payload)
        raw = (snapshot / 'songs.json').read_bytes()
        descriptor = {'file': 'songs.json', 'documentCount': 2, 'sha256': hashlib.sha256(raw).hexdigest()}
        manifest = {'schemaVersion': 1, 'exportedAt': '2026-11-03T00:00:00Z', 'projectId': 'fixture',
                    'collections': {'songs': descriptor}}
        r.write_json(snapshot / 'manifest.json', manifest)
        loaded = r.load_source(snapshot, self.source)
        self.assertEqual(loaded['report']['source'], 'merged-snapshot')
        self.assertEqual(loaded['report']['overrides'], 1)
        self.assertEqual(loaded['report']['additions'], 1)
        song = next(s for s in loaded['rows'] if s['id'] == self.rows[0]['id'])
        self.assertEqual(song, {**self.rows[0], 'title': 'Змененая'})
        with (snapshot / 'songs.json').open('a') as f: f.write(' ')
        with self.assertRaisesRegex(ValueError, 'checksum'): r.load_source(snapshot, self.source)

    def test_duplicate_or_missing_source_ids_fail(self):
        for name, rows in [('dup', [self.rows[0], self.rows[0]]), ('missing', [{'title': 'А', 'text': 'Б'}])]:
            path = self.root / f'{name}.json'
            r.write_json(path, rows)
            with self.assertRaises(ValueError): r.export(path, r.SEED, self.root / name)
            report = json.loads((self.root / name / 'export_report.json').read_text())
            self.assertGreater(report['errorCount'], 0)

    def test_baseline_and_document_version_mismatch(self):
        def mutate(d): d.core_properties.identifier = 'other'
        self.assertTrue(self.run_check(mutate)['blocked'])
        baseline = copy.deepcopy(self.baseline)
        baseline['songs'][0]['title'] = 'tampered'
        with self.assertRaises(ValueError): r.verify_baseline(baseline)

    def test_bad_zip_still_writes_blocked_report(self):
        path = self.root / 'bad.docx'
        path.write_text('invalid')
        report = r.check(path, self.base, self.root / 'bad-report', self.source)
        self.assertTrue(report['blocked'])
        self.assertTrue((self.root / 'bad-report/review_diff.json').exists())

    def test_cli_cannot_apply(self):
        process = subprocess.run(['python3', str(ROOT / 'scripts/song-review/review.py'), 'check',
                                  '--input', str(self.docx), '--baseline', str(self.base), '--apply'],
                                 capture_output=True)
        self.assertNotEqual(process.returncode, 0)
        self.assertIn(b'unrecognized arguments: --apply', process.stderr)


if __name__ == '__main__':
    unittest.main()
