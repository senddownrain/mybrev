"""Extract source-page evidence. PDF rendering is optional; this tool never edits it."""
import argparse,hashlib,json,pathlib
import fitz
p=argparse.ArgumentParser();p.add_argument('--pdf',required=True);p.add_argument('--work',required=True);p.add_argument('--render',action='store_true');a=p.parse_args()
pdf=pathlib.Path(a.pdf);out=pathlib.Path(a.work);out.mkdir(parents=True,exist_ok=True)
expected='681a59f92395a299510da4b4afc68d79cf0017518c0abb1351828560796017f3'
assert hashlib.sha256(pdf.read_bytes()).hexdigest()==expected,'Unexpected source PDF'
doc=fitz.open(pdf);assert len(doc)==13
spans=[]
for i,page in enumerate(doc):
 if a.render:
  (out/'pages').mkdir(exist_ok=True);page.get_pixmap(matrix=fitz.Matrix(1.5,1.5)).save(out/'pages'/f'page-{i+1:02}.png')
 for b in page.get_text('dict')['blocks']:
  for ln in b.get('lines',[]):
   for s in ln['spans']:spans.append({'page':i+1,**{k:s[k] for k in ['text','font','flags','color','bbox','size']}})
(out/'pdf-spans.json').write_text(json.dumps(spans,ensure_ascii=False,indent=2)+'\n')
print('PDF SHA256 and page count PASS; spans',len(spans))
