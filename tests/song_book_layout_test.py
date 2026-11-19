import sys,unittest,tempfile,copy,subprocess,shutil,json
from pathlib import Path
from docx import Document
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts/song-review'))
import review as r
class BookTest(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.temp=tempfile.TemporaryDirectory(dir=r.ROOT/'work');cls.out=Path(cls.temp.name);cls.base=r.export(r.SEED,r.SEED,cls.out/'book');cls.path=cls.out/'book/Speunik_dlia_kamisii.docx'
 @classmethod
 def tearDownClass(cls):cls.temp.cleanup()
 def parse(self,mutate=None):
  p=self.path
  if mutate:
   d=Document(p);mutate(d);p=self.out/'changed.docx';d.save(p)
  return r.parse_docx(p,self.base)
 def field(self,d,key):return next(p for p in d.paragraphs if any(n.get(qn('w:name'),'').endswith('_'+key) and n.get(qn('w:name'),'').startswith('f_') for n in p._p.iter(qn('w:bookmarkStart'))))
 def content(self,d,key):
  p=self.field(d,key);return next(x for x in d.paragraphs if x._p is p._p.getnext())
 def test_all_real_roundtrip_and_no_tables(self):
  data,errors,_,_=self.parse();self.assertEqual(errors,[]);self.assertEqual({s['id']:s for s in self.base['songs']},{k:v['song'] for k,v in data.items()});self.assertEqual(len(Document(self.path).tables),0);self.assertTrue(all(x['decision']=='НЕ ПРАВЕРАНА' for x in data.values()));self.assertEqual(sum(len(v['variants']) for v in data.values()),34)
 def test_each_field_and_insert_stanza(self):
  for k in ['title','text','chord','source','tag','tags','decision','notes']:
   def edit(d):
    p=self.content(d,k);p.text='Марыйныя' if k=='tag' else 'ВЫКЛЮЧЫЦЬ' if k=='decision' else 'Новае слова\n\nНовая страфа'
   data,errors,_,_=self.parse(edit);self.assertEqual(errors,[],k)
   if k in r.FIELDS:self.assertEqual(sum(v['song']!=next(s for s in self.base['songs'] if s['id']==sid) for sid,v in data.items()),1,k)
 def test_unknown_status_and_track_changes(self):
  for kind in ['status','track','marker','duplicate']:
   def edit(d):
    if kind=='status':self.content(d,'decision').text='unknown'
    if kind=='track':self.content(d,'text')._p.append(OxmlElement('w:ins'))
    if kind=='marker':
     p=self.field(d,'text');n=next(p._p.iter(qn('w:bookmarkStart')));n.getparent().remove(n)
    if kind=='duplicate':
     p=self.field(d,'text');p._p.addnext(copy.deepcopy(p._p))
   self.assertTrue(self.parse(edit)[1],kind)
 def test_variant_status_notes_and_stable_anchors(self):
  def edit(d):
   for p in d.paragraphs:
    for n in p._p.iter(qn('w:bookmarkStart')):
     if n.get(qn('w:name'),'').startswith('v_') and n.get(qn('w:name')).endswith('_decision'):
      p._p.getnext().find('.//'+qn('w:t')).text='ВЫКЛЮЧЫЦЬ';return
  data,errors,_,_=self.parse(edit);self.assertEqual(errors,[]);self.assertEqual(sum(v['decision']=='ВЫКЛЮЧЫЦЬ' for x in data.values() for v in x['variants']),1)
 def test_comments_and_visual_formatting(self):
  def edit(d):
   p=self.content(d,'text');p.runs[0].bold=True;d.add_comment(p.runs,'Разгляд',author='Камісія')
  data,errors,_,comments=self.parse(edit);self.assertEqual(errors,[]);self.assertEqual(len(comments),1)
 @unittest.skipUnless(shutil.which('soffice'),'LibreOffice missing')
 def test_libreoffice_full_roundtrip(self):
  out=self.out/'lo';out.mkdir();subprocess.run(['soffice','--headless','--convert-to','docx:Office Open XML Text','--outdir',str(out),str(self.path)],check=True,capture_output=True,timeout=120)
  data,errors,_,_=r.parse_docx(out/self.path.name,self.base);self.assertEqual(errors,[]);self.assertEqual({s['id']:s for s in self.base['songs']},{k:v['song'] for k,v in data.items()})
if __name__=='__main__':unittest.main()
