import argparse
_parser=argparse.ArgumentParser()
_parser.add_argument('--repo',required=True)
_parser.add_argument('--work',required=True)
_parser.add_argument('--input')
_parser.add_argument('--out')
_args=_parser.parse_args()
from pathlib import Path
import csv,json,re,collections,hashlib,shutil,subprocess,datetime,gzip
W=Path(_args.work).resolve(); R=Path(_args.repo).resolve(); O=Path(_args.out).resolve() if _args.out else W/'results'
assert O!=R and R/'src' not in O.parents and R/'public' not in O.parents, 'Refuse application output path'
O.mkdir(parents=True,exist_ok=True);(O/'input').mkdir(exist_ok=True);(O/'evidence').mkdir(exist_ok=True);(O/'tools').mkdir(exist_ok=True)
for name in ['SOURCE_Ulasny_kalyandar_dyiacezii_na_Belarusi.pdf','SOURCE_TEXT_PAGES_01-13.txt','AUDIT_SEED_CASES.csv','PLAN.md','PROMPT_01_AUDIT_CLOUD.md']:
 shutil.copyfile(W/'input'/name,O/'input'/name)
refs=json.load(open(W/'reference-parsed.json')); sweep=json.load(open(W/'sweep.json')); cases=json.load(open(W/'cases.json')); defs=json.load(open(R/'src/data/ordo/calendar-definitions.json'))
dias=['minsk-mohilev','vitebsk','pinsk','grodno'];dn={'minsk-mohilev':'Минск-Могилёв','vitebsk':'Витебск','pinsk':'Пинск','grodno':'Гродно'}
states={(x['diocese'],x['id']):x for x in sweep['states']}
url={
 'newman':'https://www.vatican.va/content/romancuria/en/dicasteri/dicastero-culto-divino-e-disciplina-sacramenti/documenti/20251109-decreto-iscrizione-newman.html',
 'newman-release':'https://press.vatican.va/content/salastampa/en/bollettino/pubblico/2026/02/03/260203a.html',
 'teresa':'https://press.vatican.va/content/salastampa/en/bollettino/pubblico/2025/02/11/250211b.html',
 'loreto':'https://www.vatican.va/content/dam/wss/roman_curia/congregations/ccdds/documents/rc_con_ccdds_doc_20191007_decreto-celebrazione-verginediloreto_en.html',
 'juan-guadalupe':'https://www.cultodivino.va/content/dam/cultodivino/rivista-notitiae/2000/notitiae-40-%282004%29/Notitiae-451-452-2004.pdf',
 'mother-church':'https://press.vatican.va/content/salastampa/en/bollettino/pubblico/2018/03/27/180327b.html',
 'paul-vi':'https://press.vatican.va/content/salastampa/en/bollettino/pubblico/2019/02/06/190206b.html',
 'irenaeus':'https://press.vatican.va/content/salastampa/en/bollettino/pubblico/2022/01/21/220121b.html',
 'index':'https://www.vatican.va/content/romancuria/en/dicasteri/dicastero-culto-divino-e-disciplina-sacramenti/documenti.html'}
J=lambda x:json.dumps(x,ensure_ascii=False,separators=(',',':'))
def writecsv(path,rows,fields=None):
 if fields is None:fields=list(dict.fromkeys(k for r in rows for k in r))
 with open(path,'w',encoding='utf-8-sig',newline='') as f:
  w=csv.DictWriter(f,fields,extrasaction='ignore');w.writeheader();w.writerows(rows)
def line(path,fragment):
 p=R/path
 if not p.exists():return ''
 for n,s in enumerate(p.read_text().splitlines(),1):
  if fragment in s:return f'{path}:{n}'
 return path
def defline(id):return line('src/data/ordo/calendar-definitions.json','"id":'+json.dumps(id,ensure_ascii=False))
def coderef(c,dia):
 if not c:return 'src/data/ordo/calendar-definitions.json (missing definition)'
 o=next((x for x in defs['dioceseOverrides'] if x['dioceseId']==dia and x['celebrationId']==c['id']),None)
 return ';'.join(x for x in [defline(o['id']) if o else '',defline(c['id'])] if x)
def datekey(x):
 r=x.get('dateRule') or x.get('date') or {}
 if r.get('type')=='fixed':return f"{r['month']:02}-{r['day']:02}"
 if r.get('type')=='named':return 'named:'+r['rule']
 if r.get('anchor') in ['baptismOfLord','holyFamily']:return 'named:'+r['anchor']
 return r.get('anchor','?')+(('+'+str(r.get('offsetDays',0))) if r.get('offsetDays',0)>=0 else str(r.get('offsetDays',0)))
def norm(s):
 return re.sub(r'\W+',' ',s.lower().replace('’','').replace('і','i').replace('cв.','св.').replace(' i ',' і ')).strip()
def evrefs(c,dia):
 if not c:return []
 o=next((x for x in defs['dioceseOverrides'] if x['dioceseId']==dia and x['celebrationId']==c['id']),None)
 return (o or c).get('source',{}).get('evidence',[])
page_spans=json.load(open(W/'pdf-spans.json'))
reference=[]
for r in refs:
 applies=r['dioceses'].split(';') if r['dioceses'] else dias
 overrides={}
 if not r['dioceses']:
  for d in applies:
   specific=[x for x in refs if x['celebration_id']==r['celebration_id'] and d in x['dioceses'].split(';')]
   if specific:overrides[d]=specific[-1]['reference_id']
 fragment=r['title'][:38]
 matching=[x for x in page_spans if x['page']==r['page'] and (fragment.strip() in x['text'] or x['text'].strip() in fragment) and len(x['text'].strip())>8]
 reference.append({'reference_id':r['reference_id'],'celebration_id':r['celebration_id'],'date_key_or_rule':r['date'],'title_be_literal':r['title'],'source_layer':r['status'],'rank':r['rank'],'printed_rank':{'solemnitas':'Урачыстасць','festum':'Свята','memoria':'Успамін'}.get(r['rank'],'') if r['rank_basis']=='explicit' else '', 'rank_basis':r['rank_basis'],'red_star':str(r['star']).lower(),'applies_to':';'.join(applies),'overridden_by_diocese':J(overrides),'pdf_page':r['page'],'pdf_quote':r['quote'],'scope_quote':r['scope_quote'],'visual_checked':'true','font_evidence':J([{k:x[k] for k in ['text','font','color','bbox']} for x in matching[:3]]),'notes':r.get('note',''),'identity_mapping':'reviewed date+title mapping; ID is a technical join, not liturgical authority','source_file':'input/SOURCE_Ulasny_kalyandar_dyiacezii_na_Belarusi.pdf'})
writecsv(O/'REFERENCE.csv',reference)
allrows=[]; data=[]; extras=[]; titles=[]; content=[]
supplemental={'ash-wednesday','palm-sunday','easter-sunday','ascension','pentecost'}
universal_extra={'sv-juan-diego','our-lady-guadalupe'}
for dia in dias:
 cur={x['id']:x for x in json.load(open(W/f'effective-{dia}.json'))};exp=json.load(open(W/f'expected-{dia}.json'))
 for id in sorted(set(cur)|set(exp)):
  c=cur.get(id);r=exp.get(id); cats=[];authority='A:PDF';severity='none';notes=[];official='';action='Сохранить.';confidence='HIGH: PDF/code; runtime publication UNVERIFIED'
  if id in supplemental:
   cats=['MATCH'];authority='GENERAL_TEMPORAL_SUPPLEMENT';notes=['Цикл времени отсутствует в этом PDF выборочно; это не лишнее собственное празднование.'];action='Сохранить computus/цикл времени; PDF не является полным temporal.'
  elif id in universal_extra:
   cats=['UNIVERSAL_UPDATE'];authority='B:ROMAN_GENERAL';official=url['juan-guadalupe']+'#page='+('118' if id=='sv-juan-diego' else '119');notes=['Не напечатано в PDF; подтверждено общим римским декретом 28.09.2002, Notitiae 40 (2004), печатная с. '+('196' if id=='sv-juan-diego' else '197')+'. Это не изменение после датировки данного PDF.'];action='Сохранить: не удалять по отсутствию в PDF.'
  elif not r:
   cats=['EXTRA_NOT_IN_OWN_CALENDAR','POSSIBLE_LOCAL_ONLY','NEEDS_DECREE'];severity='decision';authority='C/D:UNVERIFIED_DIOCESAN_RIGHT';action='После решения комиссии: предъявить позднейший акт с областью/рангом либо отключить только обще-диоцезальное назначение; тексты сохранить.';notes=['Отсутствует в рабочем собственном эталоне; ежегодный Ordo доказывает практику, не постоянное обще-диоцезальное право.']
   if id=='bl-maria-stella-companions':cats.append('DIOCESE_SCOPE');notes.append('PDF с.10 разрешает только Гродно, не Пинск.')
   if id=='our-lady-lahishyn':notes.append('Ежегодный Пинский Ordo называет покровительницей; это содержательное свидетельство, но отдельный акт о ранге/области не предоставлен.')
  elif not c:
   if id=='our-lady-braslau':
    cats=['DIOCESE_SCOPE','PARSER_UNCERTAIN','NEEDS_DECREE'];severity='decision';authority='C:IDENTITY_UNRESOLVED';action='Не создавать автоматически второе празднование. Уточнить, является ли Браслаўская местным титулом Рождества или отдельной цэлебрацией.';notes=['Код заменяет Nativity через DIOCESAN_REPLACES; PDF печатает две строки Свята. Не классифицировать автоматически как пропуск второго допустимого UI варианта.']
   else:
    cats=['MISSING'];severity='high';action='После приёмки добавить определение с областью/датой/рангом из PDF; проверить proper отдельно.'
    if id=='sv-john-henry-newman':cats.append('UNIVERSAL_UPDATE');authority='A+B:PDF_AND_ROMAN_GENERAL';official=url['newman'];notes.append('9 октября; декрет 09.11.2025 опубликован 03.02.2026. Не проецировать универсальное право задним числом на 09.10.2025.')
    if id=='bl-michal-sopocko':notes.append('PDF с.2: «У Гродзенскай і Віцебскай дыяцэзіі»; HEAD содержит только Grodno add.')
  else:
   if c['rank']!=r['rank']:cats.append('RANK');severity='high';action='После приёмки восстановить ранг PDF в editable seed; проверить новые собственные акты.'
   if not (datekey(c)==r['date'] or (c['id']=='corpus-christi' and datekey(c) in ['corpusChristi+0','named:corpusChristi'] and r['date']=='pentecost+11')):cats.append('DATE');severity='high';action='После приёмки восстановить постоянную дату PDF; годовой перенос хранить только как годовое решение.'
   if norm(c['title'])!=norm(r['title']):
    cats.append('TITLE');severity='editorial' if severity=='none' else severity
    notes.append('Нормализованное текстовое отличие; регистр и пунктуация исключены. Не каждое отличие требует изменения утверждённого текста.')
   if dia=='vitebsk' and id=='nativity-blessed-virgin-mary':cats+=['DIOCESE_SCOPE','NEEDS_DECREE'];severity='decision';authority='C:IDENTITY_UNRESOLVED';action='Решение комиссии о связи двух строк PDF, прежде чем менять identity/precedence.'
   if id=='our-lady-loreto':authority='E+B:PDF_EDITORIAL_AND_ROMAN';official=url['loreto'];notes.append('Латэранскай в PDF — редакционная ошибка относительно Loreto 10.12. Не копировать опечатку в приложение.')
   if id=='archangels-michael-gabriel-raphael':notes.append('PDF дополнительно называет Михаила покровителем Минско-Могилёвской церковной провинции; ранг остаётся Свята.')
   if id=='bl-celina-borzecka' and dia=='grodno':notes.append('В коде «Бажэцкай»; PDF «Бажэнцкай, законніцы».')
   if id=='bl-antoni-leszczewicz-jerzy-kaszyra':notes.append('PDF перечисляет пять пресвитеров; код называет двух и «паплечнікаў». Проверить утверждённый полный заголовок, не изменяя службу.')
   if id=='our-lady-trakai':notes.append('На с.8 явное «Успамін*»: обязательное, не optional. Ошибка гипотезы seed/PLAN; код festum 10.07 также не соответствует PDF.')
   if not cats:cats=['MATCH']
  if not r:
   mm=datekey(c);month=int(mm[:2]) if re.match(r'\d\d-',mm) else 0
   page={1:1,2:2,3:3,4:4,5:5,6:7,7:8,8:9,9:10,10:11,11:12,12:13}.get(month,'')
   pdf_quote='Не найдено в полном месяце PDF; отсутствие не доказывает отсутствия позднейшего акта.' if authority.startswith('C/D') else ''
  else:page=r['page'];pdf_quote=(r['scope_quote']+' '+r['quote']).strip()
  st=states.get((dia,id),{})
  row={'row_id':f'DATA-{len(data)+1:04}','row_kind':'permanent','categories':'|'.join(dict.fromkeys(cats)),'authority_class':authority,'severity':severity,'diocese':dia,'celebration_id':id,'current_date':datekey(c) if c else '', 'reference_date':r['date'] if r else '', 'current_rank':c.get('rank','') if c else '', 'reference_rank':r['rank'] if r else '', 'current_title':c.get('title','') if c else '', 'reference_title':r['title'] if r else '', 'reference_id':r['reference_id'] if r else '', 'pdf_page':page,'pdf_quote':pdf_quote,'code_reference':coderef(c,dia),'editable_source':c.get('source',{}).get('file','src/constants/fixedCalendar.js / src/utils/ordo/movableFeasts.js') if c else 'definition missing','annual_evidence_ids':';'.join(evrefs(c,dia)),'official_source':official,'confidence':confidence,'proposed_action':action,'runtime_roles_2025_2035':J(st.get('roles',{})),'runtime_examples':J(st.get('examples',{})),'notes':' '.join(notes)}
  data.append(row)
  if 'EXTRA_NOT_IN_OWN_CALENDAR' in cats:extras.append(row)
  if 'TITLE' in cats:titles.append(row)
  if c:
   cs=c.get('contentStatus',{})
   content.append({'diocese':dia,'celebration_id':id,'date':datekey(c),'rank':c['rank'],'hours_status':cs.get('hours','not-indexed-movable'),'readings_status':cs.get('readings','not-indexed'),'templates':J(c.get('templates',[])),'days_ref':J(c.get('daysRef',{})),'code_reference':coderef(c,dia),'meaning':'metadata only; no private Firestore content inspected'})
   if cs.get('hours')=='day-fallback' or cs.get('readings') in ['missing','reference-only']:
    allrows.append({**row,'row_id':f'CONTENT-{len(allrows)+1:03}','row_kind':'content','categories':'MISSING_PROPER','authority_class':'CONTENT_METADATA_ONLY','severity':'content','confidence':'HIGH metadata; live text completeness UNVERIFIED','proposed_action':'Отдельно сверить proper/чтения с локальным snapshot; не менять календарное право и не удалять текст.','notes':'Declared contentStatus='+J(cs)+'. common-only само по себе не объявлено ошибкой; пригодность всех текстов на сервере не проверена.'})
allrows=data+allrows
# Year-specific decisions remain separate from permanent records.
for o in defs['yearOverrides']:
 allrows.append({'row_id':'YEAR-'+o['id'],'row_kind':'year-override','categories':'TRANSFER_OR_PRECEDENCE|NEEDS_DECREE','authority_class':'C:YEAR_PRACTICE','severity':'decision','diocese':o['dioceseId'],'celebration_id':o['targetCelebrationId'],'current_date':o['originalDate']+' -> '+o['effectiveDate'],'reference_date':'permanent PDF unchanged','current_rank':'manual move','reference_rank':'annual authorization not independently checked','code_reference':defline(o['id'])+';'+line('src/data/ordo/year-overrides.js',"targetCelebrationId: '"+o['targetCelebrationId']+"'"),'annual_evidence_ids':';'.join(o.get('evidence',[])),'confidence':'HIGH stored practice; independent authority UNVERIFIED','proposed_action':'Проверить основание ровно для указанного года. Не превращать move в постоянную дату.','notes':o['reason']})
for item in sweep['normativeRuleIssues']:
 allrows.append({'row_id':'RULE-MMC-'+item['diocese']+'-'+item['date'],'row_kind':'runtime-rule','categories':'TRANSFER_OR_PRECEDENCE|UNIVERSAL_UPDATE','authority_class':'B:ROMAN_GENERAL','severity':'high','diocese':item['diocese'],'celebration_id':'mary-mother-church','current_date':item['date'],'reference_date':item['date'],'current_rank':'memoria with saint alternative','reference_rank':'Marian memorial prevails','code_reference':line('src/utils/ordo/display.js','if (memorialChoice)')+';'+line('src/utils/ordo/movableFeasts.js',"id: 'mary-mother-church'"),'official_source':url['mother-church'],'confidence':'HIGH source and reproduced witness','proposed_action':'В отдельной задаче согласовать правило коллизии с уведомлением 24.03.2018; data-only исправления ранга недостаточно.','notes':'primary='+item['primary']+' alternatives='+J(item['alternatives'])})
for dia in dias:
 allrows.append({'row_id':'ROMAN-IRENAEUS-'+dia,'row_kind':'universal-title','categories':'TITLE|UNIVERSAL_UPDATE','authority_class':'B:ROMAN_GENERAL','severity':'editorial','diocese':dia,'celebration_id':'sv-irenaeus','current_date':'06-28','reference_date':'06-28','current_title':'Св. Ірэнэя, біскупа і мучаніка','reference_title':'Doctor Unitatis (confirmed title; Belarusian liturgical wording needs approved source)','pdf_page':7,'code_reference':defline('sv-irenaeus'),'official_source':url['irenaeus'],'confidence':'HIGH title conferred; local approved translation UNVERIFIED','proposed_action':'Проверить утверждённую белорусскую титулатуру. Ранг memoria не повышать.','notes':'PDF и код не содержат титула доктора. Акт 21.01.2022 старше metadata PDF; это редакционная актуализация, не пост-PDF календарное изменение.'})
# Unresolved product rules are documented, not declared illegal.
for dia in dias:
 allrows.append({'row_id':'RULE-HEART-'+dia,'row_kind':'runtime-rule','categories':'TRANSFER_OR_PRECEDENCE|NEEDS_DECREE','authority_class':'C:RULE_REVIEW','severity':'decision','diocese':dia,'celebration_id':'immaculate-heart','current_date':'pentecost+20','reference_date':'pentecost+20','code_reference':line('src/utils/ordo/display.js','const memorialChoice')+';'+line('src/utils/ordo/movableFeasts.js',"id: 'immaculate-heart'"),'confidence':'HIGH current implementation; applicable collision rubric UNVERIFIED','proposed_action':'Проверить специальную рубрику совпадения двух обязательных воспоминаний; data-only sweep сохраняет product-decision.','notes':'Не переносить автоматически вывод уведомления о Mother Church на Immaculate Heart; проверить применимое правило отдельно.'})
allrows.append({'row_id':'BRIDGE-STALE-MEMO','row_kind':'runtime-bridge','categories':'TRANSFER_OR_PRECEDENCE','authority_class':'TECHNICAL_REPRODUCED','severity':'high','diocese':'pinsk (witness; cache applies to all)','celebration_id':'our-lady-budslav','current_date':'2026-07-02','reference_date':'synthetic next revision','current_rank':'memo remains memoria','reference_rank':'fresh engine feria + optional Budslav','code_reference':'src/utils/ordo/runtime.js:22;src/utils/ordo/definitions.js:190;src/components/ordo/OrdoDay.vue:373','confidence':'HIGH isolated reproduction; no publication performed','proposed_action':'Отдельный Web regression/fix: включить definitions epoch в memo или инвалидировать memo при публикации; после приёмки аудита.','notes':'resolveRuntimeDay ignores the caller epoch and keeps date|diocese key after setCalendarDefinitions. See tools/cache-probe.mjs and evidence/cache-probe.json.'})
writecsv(O/'DIFF.csv',allrows)
writecsv(O/'evidence/CONTENT_INVENTORY.csv',content)
# 241 + 75 + 4 inventory with stable source lines and joins to every effective diff.
inventory=[]
for kind,arr in [('celebration',defs['celebrations']),('diocese-override',defs['dioceseOverrides']),('year-override',defs['yearOverrides'])]:
 for x in arr:
  id=x.get('celebrationId') or x.get('targetCelebrationId') or x['id'];dia=x.get('dioceseId','')
  hits=[z for z in data if z['celebration_id']==id and (not dia or z['diocese']==dia)]
  inventory.append({'kind':kind,'document_id':x['id'],'celebration_id':id,'diocese':dia,'scope':x.get('scope',''),'action':x.get('action',''),'rank':x.get('rank',''),'date_rule':J(x.get('dateRule',{})),'enabled':x.get('enabled',True),'code_reference':defline(x['id']),'effective_diff_ids':';'.join(z['row_id'] for z in hits),'categories':';'.join(sorted(set(z['categories'] for z in hits))),'annual_evidence_ids':';'.join((x.get('source',{}) if isinstance(x.get('source'),dict) else {}).get('evidence',[]) or x.get('evidence',[]))})
writecsv(O/'evidence/DEFINITION_INVENTORY.csv',inventory)
# Evidence rules are explanatory selectors, not executable calendar additions.
rules=[];rule_stats={};evlookup={}
for dia in dias:
 f=f'src/data/ordo/evidence/{dia}.json';d=json.load(open(R/f));rule_stats[dia]={'days':len(d['days']),'celebrations':sum(len(x['celebrations']) for x in d['days']),'rules':len(d['rules']),'rule_classifications':dict(collections.Counter(x['classification'] for x in d['rules']))}
 for day in d['days']:
  for c in day['celebrations']:evlookup[c['id']]={**c,'source_path':f}
 for rule in d['rules']:
  ev=rule.get('evidence',{});rules.append({'diocese':dia,'rule_id':rule['id'],'classification':rule.get('classification'),'category':rule.get('category'),'selector':J(rule.get('selector',{})),'note_id':rule.get('noteId',''),'source_file':ev.get('file'),'source_page':ev.get('page',''),'source_paragraph':ev.get('paragraph',''),'code_reference':line(f,'"id": '+json.dumps(rule['id'],ensure_ascii=False)),'calendar_effect':'note/selector only; no automatic add/modify; see explicit layer and year inventories'})
writecsv(O/'evidence/ANNUAL_RULES.csv',rules)
evidence=[]
used=set(e for x in inventory for e in x['annual_evidence_ids'].split(';') if e)
for id in sorted(used):
 c=evlookup.get(id)
 if c:
  ev=c.get('evidence',{});evidence.append({'id':id,'celebration_id':(c.get('identity') or {}).get('id',''),'title':c.get('title'),'rank':c.get('rank'),'role':c.get('role'),'classification':c.get('classification'),'source_file':ev.get('file'),'source_page':ev.get('page',''),'source_paragraph':ev.get('paragraph',''),'quote':ev.get('rawText',''),'code_reference':line(c['source_path'],'"id": '+json.dumps(id,ensure_ascii=False)),'authority_limit':'annual practice; not independent permanent diocesan act'})
writecsv(O/'evidence/LINKED_ANNUAL_EVIDENCE.csv',evidence)
# One row per supplied hypothesis, with all-diocese expansion kept in JSON.
seeds=list(csv.DictReader(open(W/'input/AUDIT_SEED_CASES.csv',encoding='utf-8-sig')));seedrows=[]
for i,x in enumerate(seeds,1):
 id=x['celebration_id'];ds=dias if x['diocese']=='all' else [x['diocese']];hits=[r for r in data if r['celebration_id']==id and r['diocese'] in ds]
 note=''
 if id=='our-lady-trakai':note='SEED_CORRECTION: PDF p8 explicit Успамін = memoria, not optional. Current date/rank still wrong versus PDF.'
 seedrows.append({'seed_id':i,**x,'diff_ids':';'.join(r['row_id'] for r in hits),'audit_categories':J({r['diocese']:r['categories'] for r in hits}),'note':note})
writecsv(O/'evidence/SEED_COVERAGE.csv',seedrows)
# Compact reproducibility products.
for file in ['daily-current.csv.gz','candidate-roles.csv.gz','daily-projection-diff.csv.gz','cases.json']:
 shutil.copyfile(W/file,O/'evidence'/file)
(O/'evidence/sweep-summary.json').write_text(json.dumps({k:v for k,v in sweep.items() if k!='states'},ensure_ascii=False,indent=2)+'\n')
(O/'evidence/reference-reviewed.json').write_text(json.dumps(refs,ensure_ascii=False,indent=2)+'\n')
(O/'evidence/rule-inventory-summary.json').write_text(json.dumps(rule_stats,ensure_ascii=False,indent=2)+'\n')
# Summary uses separate row kinds so content and calendar issues are never conflated.
counts={dia:collections.Counter(cat for r in data if r['diocese']==dia for cat in r['categories'].split('|')) for dia in dias}
total=collections.Counter(cat for r in data for cat in r['categories'].split('|'))
summary={'reference_rows':len(refs),'reference_unique_ids':len(set(r['celebration_id'] for r in refs)),'reference_scoped_rows':sum(bool(r['dioceses']) for r in refs),'scope_expanded':sum(len(r['dioceses'].split(';')) for r in refs if r['dioceses']),'diff_rows':len(allrows),'permanent_rows':len(data),'counts_per_diocese':{d:dict(c) for d,c in counts.items()},'counts_permanent':dict(total),'extras':len(extras),'row_kinds':dict(collections.Counter(x['row_kind'] for x in allrows)),'seed_rows':len(seeds),'rule_stats':rule_stats,'linked_annual_evidence':len(evidence),'content_rows':len(content)}
(O/'evidence/summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(summary,ensure_ascii=False,indent=2))
# Text fragments for the manually reviewed Russian report.
extra_table=['| Диоцезия | Дата | Празднование / текущий ранг | PDF | Код | Статус |','|---|---|---|---|---|---|']
for z in extras:extra_table.append(f"| {dn[z['diocese']]} | {z['current_date']} | {z['current_title']} · `{z['current_rank']}` | с.{z['pdf_page']}; нет в области | `{z['code_reference']}` | C/D; отдельный акт не предоставлен |")
(W/'extra-table.md').write_text('\n'.join(extra_table))
rank_table=['| Диоцезия | ID | Сейчас | PDF | Страница | Код |','|---|---|---|---|---|---|']
for z in data:
 if 'RANK' in z['categories'].split('|') or 'DATE' in z['categories'].split('|'):rank_table.append(f"| {dn[z['diocese']]} | `{z['celebration_id']}` | {z['current_date']} · `{z['current_rank']}` | {z['reference_date']} · `{z['reference_rank']}` | {z['pdf_page']} | `{z['code_reference']}` |")
(W/'rank-table.md').write_text('\n'.join(rank_table))
title_table=['| Диоцезия | ID | Код | PDF | Страница |','|---|---|---|---|---|']
for z in titles:title_table.append(f"| {dn[z['diocese']]} | `{z['celebration_id']}` | {z['current_title']} | {z['reference_title']} | {z['pdf_page']} |")
(W/'title-table.md').write_text('\n'.join(title_table))
