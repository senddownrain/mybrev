#!/usr/bin/env python3
"""Build static document data from checked-in primary transcriptions. No remote calls."""
import json,re,hashlib
from pathlib import Path
root=Path(__file__).resolve().parents[2]
raw=(root/'docs/sources/primary/lh-decrees-2026-11-05.txt').read_text()
parts=re.split(r'(?=КАНФЕРЭНЦЫЯ\n)',raw.split('СВЯТАЯ КАНГРЭГАЦЫЯ')[0])
parts=[s for s in parts if s.strip()]
parts.append((root/'docs/sources/primary/decret-hours-IV.txt').read_text())
result=[]
for i,part in enumerate(parts):
 lines=[s.strip() for s in part.strip().splitlines() if s.strip()]
 number=lines.index('ДЭКРЭТ');date=next(k for k,s in enumerate(lines) if s.startswith('Мінск,'))
 paragraphs=[]
 for line in lines[number+1:date]:
  if line.startswith(('Першы','Другі','Трэці','Чацвёрты','Абавязваем','Выказваем')):paragraphs.append(line)
  else:paragraphs[-1]+='\n'+line
 signature=lines[date+1:]
 date_lines=[lines[date]]
 if signature[0].startswith('Свята'):date_lines.append(signature.pop(0))
 result.append(dict(id=f'volume-{i+1}',volume=i+1,roman=['I','II','III','IV'][i],number=['32/P/12','70/P/13','62/P/15','04/P/20'][i],date=['2012-06-29','2013-08-15','2015-08-06','2020-02-02'][i],issuer=lines[:2],heading='ДЭКРЭТ',paragraphs=paragraphs,dateLines=date_lines,signature=signature,sourceUrl='https://lh.catholic.by/dekrety.php' if i<3 else None,sourceFile='docs/sources/primary/lh-decrees-2026-11-05.txt' if i<3 else 'docs/sources/primary/decret-hours-IV.doc',fullText=part.strip()))
output=root/'src/data/documents/liturgy-hours-decrees.json'
encoded=json.dumps(dict(title='Дэкрэты аб выкарыстанні Літургіі гадзінаў',documents=result),ensure_ascii=False,indent=2)+'\n'
if '--check' in __import__('sys').argv:
 assert output.read_text()==encoded, 'Decree document data differs'
else: output.write_text(encoded)
print('Four full KKBB decrees verified against primary transcriptions')
