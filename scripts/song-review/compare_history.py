"""Read-only exact migration comparison; never infer identity from a title."""
import argparse,json,hashlib
from pathlib import Path
from collections import defaultdict
import review as r

def compare(source,directory,out):
    payload=r.load_source(source);rows=payload['rows'];cats={c['id']:c['title'] for c in payload['categories']}
    def key(s):
        v=r.view(s,cats)
        return r.digest([v['title'].strip(),v['text'],v['chord'],v['tag']])
    modern=defaultdict(list)
    for s in rows:modern[key(s)].append(s['id'])
    matched=[];unmatched=[];ambiguous=[];files=[]
    for name in ['sound_list.json','sound_list_10.json']:
        p=Path(directory)/name;raw=p.read_bytes();files.append({'name':name,'sha256':hashlib.sha256(raw).hexdigest()})
        data=json.loads(raw);historic=next(x['data'] for x in data if x.get('type')=='table' and x.get('name')=='sound_list')
        for i,s in enumerate(historic):
            ids=modern.get(key(s),[]);entry={'file':name,'row':i+1,'title':s['title'],'candidateIds':ids}
            if len(ids)==1:matched.append(entry)
            elif ids:ambiguous.append(entry)
            else:unmatched.append(entry)
    used=[x['candidateIds'][0] for x in matched];reused=[sid for sid in set(used) if used.count(sid)>1]
    result={'criterion':'exact title(trim), text/chord(CRLF/CR to LF), ordered category names; never title-only; no fuzzy auto-assignment',
            'files':files,'matched':matched,'ambiguous':ambiguous,'historicalUnmatched':unmatched,'modernUnmatched':[s['id'] for s in rows if s['id'] not in used], 'reusedIds':reused}
    out=Path(out);out.mkdir(parents=True,exist_ok=True);r.write_json(out/'historical_comparison.json',result)
    (out/'historical_comparison.md').write_text(f"# Историческая сверка\n\nТочные соответствия: {len(matched)}; неоднозначные: {len(ambiguous)}; исторические без соответствия: {len(unmatched)}; современные без соответствия: {len(result['modernUnmatched'])}.\n\nКритерий: {result['criterion']}.\n\nЭто сравнение с seed, не с production. Никаких изменений или назначения ID.\n"+''.join(f"\n- Ручная проверка: {e}" for e in unmatched+ambiguous))
    return result
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--source',default=str(r.SEED));p.add_argument('--historical-dir',required=True);p.add_argument('--out',required=True);a=p.parse_args();x=compare(a.source,a.historical_dir,a.out);print('exact',len(x['matched']),'ambiguous',len(x['ambiguous']))
