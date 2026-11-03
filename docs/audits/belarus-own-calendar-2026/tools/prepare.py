import argparse
_parser=argparse.ArgumentParser()
_parser.add_argument('--repo',required=True)
_parser.add_argument('--work',required=True)
_parser.add_argument('--input')
_parser.add_argument('--out')
_args=_parser.parse_args()
import json,pathlib,re,collections
W=pathlib.Path(_args.work).resolve(); repo=pathlib.Path(_args.repo).resolve()
refs=json.load(open(W/'reference-parsed.json')); dias=['minsk-mohilev','vitebsk','pinsk','grodno']
for dia in dias:
 expected={}
 for r in refs:
  if not r['dioceses'] or dia in r['dioceses'].split(';'):
   expected[r['celebration_id']]=r
 (W/f'expected-{dia}.json').write_text(json.dumps(expected,ensure_ascii=False,indent=2))
print('expected',[(d,len(json.load(open(W/f'expected-{d}.json')))) for d in dias])
print('unique PDF identities',len(set(r['celebration_id'] for r in refs)))
print('rows scoped',sum(bool(r['dioceses']) for r in refs),'scopeexpanded',sum(len(r['dioceses'].split(';')) for r in refs if r['dioceses']))
