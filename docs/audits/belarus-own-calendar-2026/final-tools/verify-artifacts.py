"""Offline consistency check for the final audit. No network or repository mutations."""
import argparse
import collections
import csv
import hashlib
import json
import pathlib
import re
import subprocess

p = argparse.ArgumentParser()
p.add_argument('--repo', required=True)
a = p.parse_args()
repo = pathlib.Path(a.repo).resolve()
root = repo / 'docs/audits/belarus-own-calendar-2026'

def rows(name):
    with (root / name).open(encoding='utf-8-sig', newline='') as f:
        return list(csv.DictReader(f))

old, prod, decisions = (rows(n) for n in ['DIFF.csv', 'PRODUCTION_DIFF.csv', 'DECISION_MATRIX.csv'])
substantive = {'EXTRA_NOT_IN_OWN_CALENDAR', 'MISSING', 'RANK', 'DATE', 'DIOCESE_SCOPE', 'PARSER_UNCERTAIN'}
baseline = [x for x in old if x['row_kind'] == 'permanent']
permanent = [x for x in prod if x['row_kind'] == 'permanent']
assert len(prod) == 1082 and len(decisions) == 172
assert len(baseline) == len(permanent) == 1011
assert {x['row_id'] for x in baseline} == {x['prior_row_id'] for x in permanent}
sub = [x for x in permanent if substantive & set(x['categories'].split('|'))]
assert len(sub) == 48
assert collections.Counter(x['diocese'] for x in sub) == {'minsk-mohilev': 1, 'vitebsk': 5, 'pinsk': 14, 'grodno': 28}
assert collections.Counter(x['class'] for x in decisions) == {'A': 33, 'B': 2, 'C': 31, 'D': 48, 'KEEP': 58}
for category, count in [('EXTRA_NOT_IN_OWN_CALENDAR', 23), ('RANK', 17), ('DATE', 3), ('MISSING', 5)]:
    expected = {(x['diocese'], x['celebration_id']) for x in baseline if category in x['categories'].split('|')}
    actual = {(x['diocese'], x['celebration_id']) for x in permanent if category in x['categories'].split('|')}
    assert expected == actual and len(actual) == count, category
ids = [x['decision_id'] for x in decisions]
assert len(set(ids)) == 172
report = (root / 'FINAL_REPORT.md').read_text()
assert len(re.findall(r'^## \d+\.', report, re.M)) == 18
for item in ids:
    assert sum(item in line for line in report.splitlines() if re.match(r'^\| \d+ · ', line)) == 1, item
commission = (root / 'COMMISSION_QUESTIONS.md').read_text()
assert set(re.findall(r'^\| (C\d\d) \|', commission, re.M)) == {f'C{i:02}' for i in range(1, 24)} | {f'C{i:02}' for i in range(25, 29)}
for item in ['C24', 'C29', 'C30']:
    assert item in commission
for x in decisions:
    for field in ['web_impact', 'flutter_impact', 'hours_impact', 'readings_impact', 'default_impact', 'proper_access_risk', 'rollback']:
        assert x[field], (x['decision_id'], field)
    assert x['implementation_status'] == 'PROPOSED_ONLY_NO_CHANGES'
for name, digest in json.loads((root / 'artifact-sha256.json').read_text()).items():
    assert hashlib.sha256((root / name).read_bytes()).hexdigest() == digest, name
for name, digest in json.loads((root / 'FINAL_SOURCE_MANIFEST.json').read_text())['source_hashes_unchanged'].items():
    assert hashlib.sha256((repo / name).read_bytes()).hexdigest() == digest, name
for filename in ['FINAL_REPORT.md', 'FIRESTORE_AUDIT.md', 'IMPLEMENTATION_PLAN.md', 'COMMISSION_QUESTIONS.md']:
    for target in re.findall(r'\]\(([^)]+)\)', (root / filename).read_text()):
        if '://' not in target and not target.startswith('#'):
            assert (root / target.split('#')[0]).exists(), (filename, target)
changed = subprocess.check_output(['git', 'diff', '--name-only', '34301a65b0e58f43a514c0d62968e9bf043a7f42', '--'], cwd=repo, text=True).splitlines()
assert all(x.startswith('docs/audits/belarus-own-calendar-2026/') for x in changed)
new = subprocess.check_output(['git', 'ls-files', '--others', '--exclude-standard'], cwd=repo, text=True).splitlines()
assert all(x.startswith('docs/audits/belarus-own-calendar-2026/') for x in new)
print(json.dumps({'status': 'PASS', 'permanentRows': 1011, 'substantive': 48, 'extras': 23, 'ranks': 17, 'dates': 3, 'missing': 5, 'decisions': 172, 'commissionCases': 30, 'reportSections': 18, 'previousArtifactHashes': 'unchanged', 'runtimeAndFlutter': 'unchanged', 'networkRequests': 0}, ensure_ascii=False, indent=2))
