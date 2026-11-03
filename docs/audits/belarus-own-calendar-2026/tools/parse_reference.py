import argparse
_parser=argparse.ArgumentParser()
_parser.add_argument('--repo',required=True)
_parser.add_argument('--work',required=True)
_parser.add_argument('--input')
_parser.add_argument('--out')
_args=_parser.parse_args()
import re,json,pathlib,difflib,collections
ROOT=pathlib.Path(_args.work).resolve()
input_root=pathlib.Path(_args.input).resolve() if _args.input else ROOT/'input'
text=(input_root/'SOURCE_TEXT_PAGES_01-13.txt').read_text()
months=['СТУДЗЕНЬ','ЛЮТЫ','САКАВІК','КРАСАВІК','МАЙ','ЧЭРВЕНЬ','ЛІПЕНЬ','ЖНІВЕНЬ','ВЕРАСЕНЬ','КАСТРЫЧНІК','ЛІСТАПАД','СНЕЖАНЬ']
rankre=re.compile(r'\s+(Урачыстасць|Успамін|Свята)(\*?)\s*$')
starts=re.compile(r'^(?:Св\.|Свв\.|СВ\.|CВ\.|Бл\.|Найсв|НАЙСВ|Гадавіна|ГАДАВІНА|УРАЧЫСТАСЦЬ|АБ’ЯЎЛЕННЕ|НАВЯРТАННЕ|КАТЭДРЫ|ЗВЕСТАВАННЕ|АДВЕДЗІНЫ|НАРАДЖЭННЕ|ПЕРАМЯНЕННЕ|УНЕБАЎЗЯЦЦЕ|Мучаніцтва|УЗВЫШЭННЕ|АХВЯРАВАННЕ|Ахвяраванне|УСІХ|УСПАМІН|БЕЗЗАГАННАГА|СВЯТОЙ СЯМ|ПАНА НАШАГА)')
rows=[];cur=None;scope='';scope_quote='';date='';page=0;month=0;in_scope=False;movable=False

def flush():
 global cur
 if cur:
  cur['title']=' '.join(cur.pop('parts')).strip()
  cur['quote']=' '.join(cur.pop('raw'))
  cur['star']='*' in cur['quote']
  cur['title']=cur['title'].replace('*','').strip()
  if cur['date']=='11-02':cur['rank']='commemoratio-defunctorum';cur['rank_basis']='special-all-souls-unranked'
  rows.append(cur);cur=None

def scopeof(t):
 a=[]
 for name,id in [('Мінска','minsk-mohilev'),('Віцебск','vitebsk'),('Пінск','pinsk'),('Гродзенск','grodno')]:
  if name.lower() in t.lower():a.append(id)
 return ';'.join(a)

for line in text.splitlines():
 t=line.strip()
 if not t:continue
 if t.startswith('=========='):
  flush();page=int(re.search(r'PAGE (\d+)',t)[1]);continue
 if t in months:
  flush();month=months.index(t)+1;date='';continue
 if not month or t.isdigit() or t.startswith('Калі не пазначана'):continue
 if t.startswith(('Нядзеля пасля 6','Панядзелак пасля','Першая нядзеля пасля','Чацвер пасля','Пятніца пасля','Субота пасля','Апошняя нядзеля','Нядзеля ў актаве')):
  flush();scope='';scope_quote='';movable=True
  if t.startswith('Нядзеля пасля 6'):date='named:baptismOfLord'
  elif t.startswith('Панядзелак'):date='pentecost+1'
  elif t.startswith('Першая'):date='pentecost+7'
  elif t.startswith('Чацвер пасля Найсвяцейшай'):date='pentecost+11'
  elif t.startswith('Чацвер пасля Нядзелі'):date='pentecost+4'
  elif t.startswith('Пятніца'):date='pentecost+19'
  elif t.startswith('Субота'):date='pentecost+20'
  elif t.startswith('Апошняя'):date='firstAdventSunday-7'
  else:date='named:holyFamily'
  scope_quote=t
  if ':' in t and t.startswith('Нядзеля пасля 6'):t=t.split(':',1)[1].strip()
  else:continue
 m=re.match(r'^(\d{1,2})\.\s*(.*)$',t)
 if m:
  flush();date=f'{month:02}-{int(m[1]):02}';scope='';scope_quote='';in_scope=False;movable=False;t=m[2]
  if not t:continue
 if t.startswith('У ') or in_scope:
  flush();scope_quote=(scope_quote+' '+t).strip() if in_scope else t
  scope=scopeof(scope_quote);in_scope=not t.endswith(':');continue
 if t=='Актава Нараджэння Пана':scope_quote=t;continue
 # Multiple saints in one physical line on p4.
 lines=re.split(r'(?<=мучаніка)\s+(?=Св\. Адальбэрта)',t)
 for t in lines:
  # these starts are continuations of long titles
  continuation=cur and ((date=='09-29' and t.startswith('СВ. ГАБРЫЭЛЯ')) or (date=='11-16' and t.startswith('(Маці')) or (date=='02-17' and t.startswith('Найсв.')))
  new=bool(starts.match(t)) and not continuation
  if new:flush()
  rm=rankre.search(t);rank=None
  if rm:
   rank={'Урачыстасць':'solemnitas','Успамін':'memoria','Свята':'festum'}[rm[1]]
   clean=t[:rm.start()].strip()+rm[2]
  else:clean=t
  if cur is None:
   cur={'page':page,'date':date,'dioceses':scope,'scope_quote':scope_quote,'parts':[],'raw':[],'rank':'memoria-ad-libitum','rank_basis':'p1-default-unranked'}
  cur['parts'].append(clean);cur['raw'].append(t)
  if rank:cur['rank']=rank;cur['rank_basis']='explicit'
flush()
# Identify by date + normalized title, keeping PDF ranks independent of code.
d=json.load(open(pathlib.Path(_args.repo)/'src/data/ordo/calendar-definitions.json'))
candidates=d['celebrations']+[dict(x,id=x['celebrationId']) for x in d['dioceseOverrides'] if 'title' in x]
def norm(s):return re.sub(r'[^\w]+',' ',s.lower().replace('’','').replace('і','i')).strip()
manual={('07-05','Найсв. Панны Марыі Тракельскай'):'our-lady-trakai',('09-08','НАЙСВ. ПАННЫ МАРЫІ БРАСЛАЎСКАЙ'):'our-lady-braslau',('10-09','Св. Джона Генры Ньюмана, прэзбітэра і доктара Касцёла'):'sv-john-henry-newman'}
for i,r in enumerate(rows,1):
 r['reference_id']=f'PDF-{i:03}'
 if (r['date'],r['title']) in manual:r['celebration_id']=manual[(r['date'],r['title'])];r['match_score']=1
 elif r['date'].startswith(('pentecost','firstAdvent','named:')):
  r['celebration_id']={'pentecost+1':'mary-mother-church','pentecost+7':'trinity','pentecost+11':'corpus-christi','pentecost+4':'christ-the-high-priest','pentecost+19':'sacred-heart','pentecost+20':'immaculate-heart','firstAdventSunday-7':'christ-king','named:holyFamily':'holy-family','named:baptismOfLord':'baptism-of-the-lord'}[r['date']];r['match_score']=1
 else:
  choices=[]
  for c in candidates:
   rule=c.get('dateRule',{});cd=f"{rule.get('month',0):02}-{rule.get('day',0):02}" if rule.get('type')=='fixed' else ''
   if cd!=r['date']:continue
   if c.get('dioceseId') and c['dioceseId'] not in r['dioceses']:continue
   score=difflib.SequenceMatcher(None,norm(r['title']),norm(c['title'])).ratio()
   choices.append((score,c['id']))
  choices.sort(reverse=True)
  if choices:r['match_score'],r['celebration_id']=choices[0]
  else:r['match_score']=0;r['celebration_id']='UNMAPPED'
 r['status']='diocese' if r['dioceses'] else ('belarus' if r['star'] else 'general')
 if r['celebration_id'] in ['sv-cyril-methodius','sv-catherine-siena','sv-benedict','sv-bridget','sv-teresa-benedicta-cross']:r['status']='europe'
 if r['celebration_id']=='holy-name-of-jesus':r['status']='general';r['note']='PDF marks star; General Calendar identity independently present. Star is preserved, not proof of exclusive Belarus scope.'
 if r['celebration_id']=='archangels-michael-gabriel-raphael':r['status']='general+belarus';r['note']='General feast; Michael also patron of Minsk-Mohilev ecclesiastical province in PDF. No rank increase.'
 if r['celebration_id']=='christ-the-high-priest':r['status']='belarus';r['note']='National feast, PDF without star; not a universal celebration.'
 if r['date']=='11-02':r['note']='No printed rank. All Souls is a special day, not optional memorial; literal absence recorded, special class supplied explicitly.'
 if r['celebration_id']=='our-lady-loreto':r['note']='PDF prints Латэранскай on Dec 10; identity Loreto is an editorial inference verified against Roman decree, not literal PDF title.'
 if r['celebration_id']=='our-lady-trakai':r['note']='PDF explicit Успамін, roman type; seed/PLAN optional hypothesis contradicted by PDF.'
print('rows',len(rows),collections.Counter(r['page'] for r in rows))
for r in rows:print(f"{r['reference_id']} p{r['page']} {r['date']} [{r['dioceses'] or r['status']}] {r['rank']} {r['celebration_id']} ({r['match_score']:.2f}) | {r['title']}")
(ROOT/'reference-parsed.json').write_text(json.dumps(rows,ensure_ascii=False,indent=2))
