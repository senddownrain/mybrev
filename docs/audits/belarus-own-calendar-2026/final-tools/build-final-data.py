import argparse
_p=argparse.ArgumentParser();_p.add_argument('--repo',required=True);_p.add_argument('--work',required=True);_p.add_argument('--out');_a=_p.parse_args()
from pathlib import Path
import json,csv,gzip,collections,hashlib,datetime,shutil,subprocess
W=Path(_a.work).resolve();R=Path(_a.repo).resolve();A=R/'docs/audits/belarus-own-calendar-2026';O=Path(_a.out).resolve() if _a.out else W/'results';O.mkdir(parents=True,exist_ok=True);E=O/'final-evidence';E.mkdir(exist_ok=True)
read=lambda p:json.load(open(p));J=lambda v:json.dumps(v,ensure_ascii=False,separators=(',',':'))
old=list(csv.DictReader(open(A/'DIFF.csv',encoding='utf-8-sig')));summary=read(W/'production-summary.json');stats=read(W/'role-stats.json');eff=read(W/'private/effective-production.json');prod=read(W/'private/production-definitions.json');bundle=read(R/'src/data/ordo/calendar-definitions.json');canon=read(W/'canonical-comparison.json')
dias=['minsk-mohilev','vitebsk','pinsk','grodno'];names={'minsk-mohilev':'Минск-Могилёв','vitebsk':'Витебск','pinsk':'Пинск','grodno':'Гродно'}
DAY={m:{d['diocese']+'|'+d['date']:d for d in json.load(gzip.open(W/(m+'-days.json.gz'),'rt'))} for m in ['web-bundle','production','web-selected-current']}
refs=read(A/'evidence/reference-reviewed.json');byref={x['reference_id']:x for x in refs}
NORM={'mother':'https://press.vatican.va/content/salastampa/en/bollettino/pubblico/2018/03/27/180327b.html','heart':'https://www.vatican.va/roman_curia/congregations/ccdds/documents/rc_con_ccdds_doc_20000630_memoria-immaculati-cordis-mariae-virginis_lt.html'}
def csvwrite(p,rows):
 fields=list(dict.fromkeys(k for r in rows for k in r))
 with open(p,'w',encoding='utf-8-sig',newline='') as f:w=csv.DictWriter(f,fields,extrasaction='ignore');w.writeheader();w.writerows(rows)
def datekey(c):
 d=c['date']
 return f"{d['month']:02}-{d['day']:02}" if d['type']=='fixed' else 'dynamic:'+d.get('anchor','')
def safecontext(d):
 if not d:return None
 return {'date':d['date'],'primary':d['primary'],'alternatives':d['alternatives'],'commemorations':d['commemorations'],'suppressed':d['suppressed'],'officePrimary':d['officePrimary'],'firstVespers':d['firstVespers'],'evening':d['evening']}
def context(dia,key,model):
 if len(key)==5 and key[2]=='-':return safecontext(DAY[model].get(dia+'|2026-'+key))
 return None
def fs_paths(id,dia):
 a=[]
 if any(x['id']==id for x in prod['celebrations']):a.append('liturgicalCelebrations/'+id)
 for x in prod['dioceseOverrides']:
  if x['celebrationId']==id and x['dioceseId']==dia:a.append('liturgicalDioceseOverrides/'+x['id'])
 return ';'.join(a)
rows=[];decisions=[]
def decide(id,cl,issue,facts,proposal,diocese='',celebration='',date='',commission='no',prev='',confidence='HIGH',kind='calendar',owner='Да, в общей приёмке следующего этапа',source=''):
 if cl=='C':confidence='Факты: высокая; окончательное право/нормативная схема: не установлены'
 row={'decision_id':id,'class':cl,'kind':kind,'diocese':diocese,'celebration_id':celebration,'date':date,'issue':issue,'facts':facts,'proposal':proposal,'confidence':confidence,'commission_required':commission,'owner_decision_required':owner,'prior_row_id':prev,'sources':source,
 'web_impact':'Изменяется календарное назначение/выбор; проверять primary/alternative/commemoratio/suppressed.' if cl in ['A','B','C'] else 'Механизм загрузки/обновления или проверка данных; право празднования не меняется автоматически.',
 'flutter_impact':'После Web: перенести утверждённые definitions и проверить bundle/overlay/parity; Flutter сейчас не исследован и не изменён.',
 'hours_impact':'Проверить selected Office, I/II Vespers и references; тексты не удалять.',
 'readings_impact':'Проверить правильную ссылку на чтения и собственные/будние варианты; тексты не переписывать.',
 'default_impact':'См. PRODUCTION_DIFF и before/after cases; по одному рангу не обещать одинаковое изменение всех лет.',
 'proper_access_risk':'Снять только назначение; сохранить docs/templates и отдельный безопасный доступ к proper. Не делать orphan-delete.',
 'rollback':'Восстановить сохранённые назначения новой большей revision; годовые записи откатывать отдельно, серверный номер не уменьшать.',
 'implementation_status':'PROPOSED_ONLY_NO_CHANGES'}
 prior=next((x for x in old if x['row_id']==prev),{})
 cats=set(prior.get('categories','').split('|'))
 if cl=='KEEP':
  row.update(web_impact='Без изменения назначения, даты, ранга и доступных вариантов.',hours_impact='Без изменения выбора Литургии часов.',readings_impact='Без изменения выбора чтений.',default_impact='Сохранить нынешний выбор с действующими правилами старшинства.',proper_access_risk='Нового риска нет: тексты и ссылки сохраняются.',rollback='Миграция не предлагается; откат не требуется.')
 elif kind=='title' or (kind=='permanent' and cl=='A' and not cats & {'RANK','DATE','MISSING'}):
  row.update(web_impact='Редакторское изменение названия/патроната; identity и ранг сохранить.',hours_impact='Заголовок может измениться; псалмодия и тексты службы сохраняются.',readings_impact='Набор и ссылки чтений не менять.',default_impact='Без изменения празднования по умолчанию.',proper_access_risk='Низкий при сохранении identity и content refs.',rollback='Вернуть прежний заголовок; опубликованные календарные данные восстанавливать новой большей revision.')
 elif kind=='content':
  row.update(web_impact='Уточнение доступности собственных текстов по указанным refs; календарное право этой проверкой не меняется.',hours_impact='Возможны собственная служба либо общий чин/fallback; реальные тела не проверены.',readings_impact='Проверить собственные и будние references; отсутствие в metadata не доказывает отсутствие текста.',default_impact='Само уточнение refs не должно менять календарный primary.',proper_access_risk='Неизвестен до точечной проверки refs; удаления и переписывание не предлагаются.',rollback='Сохранить и при необходимости вернуть прежние content refs; тексты не удалять.')
 elif kind=='year':
  row.update(web_impact='Только указанный год и область: '+date+'. Постоянную дату не менять.',hours_impact='Проверить службу исходного/нового дня и вечерние границы обоих дней.',readings_impact='Проверить перенесённые собственные чтения и будний fallback в обе даты.',default_impact='Для обычных auto уже 0 отличий от расчёта; для ручных/C30 сравнить обе даты после решения.',proper_access_risk='Низкий при сохранении ID; неверная дата может скрыть доступ в ожидаемый день.',rollback='Вернуть конкретный годовой документ из приватного снимка и инвалидировать year cache; permanent meta недостаточно.')
 elif kind=='technical':
  row.update(web_impact='Устранить описанный в facts механизм загрузки/обновления; набор прав празднований не менять.',hours_impact='Открытая Литургия часов должна получить тот же новый epoch/набор, что календарь.',readings_impact='Сбросить устаревший выбор/ссылки после обновления, не переписывая чтения.',default_impact='После обновления показывать default принятой версии; конкретная нормативная правка здесь не задаётся.',proper_access_risk='Переход между версиями может временно скрыть option; проверять атомарность клиентского состояния.',rollback='Обратимый Web release; данные при необходимости восстановить новой большей revision, year channel отдельно.')
 elif kind=='rule':
  row['default_impact']='При коллизии будний день по умолчанию, оба воспоминания необязательные.' if id=='B-HEART' else 'Маці Касцёла по умолчанию, Бонифаций не предлагается.' if id=='B-MOTHER' else 'До ответа C29 не менять provisional правило; отдельно проверить конкурирующие праздники.'
 elif 'DATE' in cats:
  row['default_impact']='Убрать постоянное назначение с '+prior.get('current_date','')+' и поставить на '+prior.get('reference_date','')+'; обе даты разрешать по старшинству каждого года.'
 elif 'RANK' in cats:
  row['default_impact']='Ранг '+prior.get('current_rank','')+' → '+prior.get('reference_rank','')+'; фактическое появление default/alternative зависит от старшего дня. См. ролевые счётчики.'
 elif 'MISSING' in cats:
  row['default_impact']='Добавить необязательное воспоминание; будний день остаётся default, в пост — commemoratio, старшие дни подавляют вариант. Newman применять с 2026.' if celebration=='sv-john-henry-newman' else 'Добавить необязательное воспоминание Витебска; обычный будний default сохраняется, в пост — commemoratio, воскресенье подавляет память.'
 elif 'EXTRA_NOT_IN_OWN_CALENDAR' in cats:
  row['default_impact']='Временное снятие solemnitas возвращает общее воспоминание Queenship и меняет вечернюю службу.' if celebration=='our-lady-lahishyn' else 'При временном снятии обязательной памяти вернётся общий/будний default, если нет старшего дня.' if prior.get('current_rank')=='memoria' else 'При временном снятии optional исчезает только этот вариант/commemoratio; общий default обычно сохраняется.'
 decisions.append(row);return row
for z in [r for r in old if r['row_kind']=='permanent']:
 dia,id=z['diocese'],z['celebration_id'];c=next((x for x in eff[dia] if x['id']==id),None);cats=z['categories'].split('|')
 cl='A';commission='no';proposal=z['proposed_action'];issue='Сопоставление постоянных определений'
 if 'MATCH' in cats:cl='KEEP';proposal='Сохранить.'
 elif 'EXTRA_NOT_IN_OWN_CALENDAR' in cats:
  cl='C';commission='yes';issue='Дополнительное диоцезальное назначение вне утверждённого PDF';proposal='Утвердить временное исключение из общего диоцезального выбора без удаления proper; окончательное сохранение/ранг/местная область — по ответу комиссии.'
 elif id in ['our-lady-braslau','nativity-blessed-virgin-mary'] and dia=='vitebsk':
  cl='C';commission='yes';issue='Identity Braslau/Nativity';proposal='До ответа комиссии сохранить явно помеченную текущую связь; не добавлять второй вариант автоматически. Утвердить одну identity/локальный титул либо особую схему двух цэлебраций.'
 elif 'UNIVERSAL_UPDATE' in cats and 'MISSING' not in cats:
  cl='KEEP';proposal='Сохранить подтверждённое празднование Общего календаря, отсутствующее в PDF.'
 elif 'MISSING' in cats:
  issue='Отсутствующее календарное определение';proposal='Добавить назначение по PDF/общему акту; доступность approved proper проверить отдельно. Newman с 2026, не 09.10.2025.' if id=='sv-john-henry-newman' else 'Добавить Витебскую область Сапоцькі 15.02 optional; сохранить Grodno и проверить корректные content refs.'
 elif 'RANK' in cats or 'DATE' in cats:
  issue='Прямое несоответствие ранга/даты утверждённому PDF';proposal='Восстановить ранг/дату PDF в seed и согласованной публикации; это не вопрос расшифровки PDF. Сохранение отличного варианта допустимо только при предъявлении конкретного нового акта.'
 elif 'TITLE' in cats:
  issue='Текстовое отличие заголовка'
  if id in ['archangels-michael-gabriel-raphael','bl-antoni-leszczewicz-jerzy-kaszyra','bl-celina-borzecka']:
   proposal='Редакторски привести содержательные имена/патронат к утверждённому PDF, сохранив identity/ранг и тексты службы.'
  else:
   cl='KEEP';proposal='Сохранить текущий вариант: буквальное отличие, склонение/синоним/расширенный титул не доказывает ошибку; верное Loreto не менять на опечатку PDF.'
 wkey=z['reference_date'] or z['current_date'];pkey=datekey(c) if c else ''
 contextsWeb={k:v for k,v in [('pdf-date',context(dia,wkey,'web-bundle')),('web-date',context(dia,z['current_date'],'web-bundle'))] if v}
 contextsFS={k:v for k,v in [('pdf-date',context(dia,wkey,'production')),('firestore-date',context(dia,z['current_date'],'production'))] if v}
 stW=stats['web-bundle'].get(dia+'|'+id,{});stP=stats['production'].get(dia+'|'+id,{})
 current=next(iter(contextsFS.values()),None)
 r={'row_id':'PROD-'+z['row_id'],'prior_row_id':z['row_id'],'row_kind':'permanent','categories':z['categories'],'decision_class':cl,'diocese':dia,'celebration_id':id,'title':z['reference_title'] or z['current_title'],'pdf_date':z['reference_date'],'web_date':z['current_date'],'firestore_date':z['current_date'] if c else '', 'pdf_rank':z['reference_rank'],'web_rank':z['current_rank'],'firestore_rank':c['rank'] if c else '',
 'pdf_presence':'printed' if z['reference_id'] else ('universal-confirmed-outside-PDF' if 'UNIVERSAL_UPDATE' in cats else 'not-printed-in-scope' if 'EXTRA_NOT_IN_OWN_CALENDAR' in cats else 'temporal-supplement'),
 'web_presence':bool(c),'firestore_presence':bool(c),'production_permanent_vs_web':'MATCH' if c else 'ABSENT_BOTH',
 'current_web_selection':'bundled permanent revision 3 + fetched production year overrides (15); cache conditions apply',
 'web_default_and_alternatives':J(contextsWeb),'firestore_default_and_alternatives':J(contextsFS),'active_default_example':J(current['primary'] if current else {}),'active_alternatives_example':J(current['alternatives'] if current else []),
 'web_roles_2025_2035':J(stW.get('counts',{})),'firestore_roles_2025_2035':J(stP.get('counts',{})),'runtime_examples':J(stP.get('examples',{})),
 'source_document_paths':fs_paths(id,dia),'source_change':z['editable_source']+'; '+z['annual_evidence_ids'],'pdf_page':z['pdf_page'],'pdf_quote':z['pdf_quote'],'source_code':z['code_reference'],'official_source':z['official_source'],'confidence':'HIGH observed production and Web metadata; normative unresolved scope marked separately','proposal':proposal,'commission_required':commission,'notes':z['notes']}
 rows.append(r)
 if z['categories']!='MATCH':
  facts=f"PDF: {z['reference_date']} {z['reference_rank'] or 'нет назначения в области'}; Web/Firestore: {z['current_date']} {z['current_rank'] or 'нет определения'}; effective metadata совпадают."
  if 'TITLE' in cats:facts+=' Заголовок: '+z['current_title']+' → '+z['reference_title']+'.'
  decide('DEC-'+z['row_id'],cl,issue,facts,proposal,dia,id,z['reference_date'] or z['current_date'],commission,z['row_id'],kind='permanent',owner='Нет, сохранить' if cl=='KEEP' else 'Да: временное исключение/окончательное решение' if cl=='C' else 'Да, в общей приёмке A',source=z['code_reference']+';PDF p'+z['pdf_page']+';'+z['official_source'])
# Content metadata is not a claim that full liturgical texts were read.
for z in [r for r in old if r['row_kind']=='content']:
 c=next(x for x in eff[z['diocese']] if x['id']==z['celebration_id']);rows.append({'row_id':'PROD-'+z['row_id'],'prior_row_id':z['row_id'],'row_kind':'content-metadata','categories':'MISSING_PROPER','decision_class':'D','diocese':z['diocese'],'celebration_id':z['celebration_id'],'title':c['title'],'pdf_date':z['reference_date'],'web_date':z['current_date'],'firestore_date':z['current_date'],'pdf_rank':z['reference_rank'],'web_rank':z['current_rank'],'firestore_rank':c['rank'],'web_presence':True,'firestore_presence':True,'source_document_paths':fs_paths(c['id'],z['diocese']),'confidence':'HIGH metadata; actual proper bodies NOT_INSPECTED','proposal':'Проверить content refs и fallback в отдельном разрешённом content scope; не удалять тексты и не смешивать с календарным правом.','notes':z['notes']})
 decide('DEC-'+z['row_id'],'D','Content metadata / proper',z['notes'],'Проверить proper по минимальным конкретным refs после отдельного content-разрешения, если это потребуется. Наличие текстов в этих коллекциях не сканировалось.',z['diocese'],z['celebration_id'],z['current_date'],prev=z['row_id'],kind='content',confidence='HIGH metadata; bodies UNVERIFIED',source=z['code_reference'])
for z in [r for r in old if r['row_kind']=='universal-title']:
 rows.append({**{k:z.get(k,'') for k in ['celebration_id','diocese','official_source']},'row_id':'PROD-'+z['row_id'],'prior_row_id':z['row_id'],'row_kind':'universal-title','categories':z['categories'],'decision_class':'A','pdf_rank':'memoria','web_rank':'memoria','firestore_rank':'memoria','title':z['current_title'],'proposal':z['proposed_action'],'confidence':z['confidence'],'notes':'General title update; PDF rank remains a separate literal baseline.'})
 decide('DEC-'+z['row_id'],'A','Титул Иренея: General update',z['notes'],z['proposed_action'],z['diocese'],z['celebration_id'],'06-28',prev=z['row_id'],kind='title',confidence=z['confidence'],source=z['official_source'])
# Actual year documents, not fabricated copies of permanent dates.
for y in summary['yearOverrides']:
 ismanual=y['existsInBundle'];special=y['id']=='auto-transfer-2033-belarus-nativity-john-baptist';cl='C' if ismanual or special else 'D';commission='yes' if cl=='C' else 'no'
 dia=y.get('dioceseId','all');id=y['targetCelebrationId'];cs=[v for v in summary['yearCases'] if v['id']==y['id']]
 r={'row_id':'YEAR-'+y['id'],'row_kind':'year-override','categories':'TRANSFER_OR_PRECEDENCE','decision_class':cl,'diocese':dia,'celebration_id':id,'pdf_date':next((r['date'] for r in refs if r['celebration_id']==id),''),'web_date':y['originalDate']+' -> '+y['effectiveDate'] if ismanual else 'computed by engine, absent as bundled year document','firestore_date':y['originalDate']+' -> '+y['effectiveDate'],'web_presence':ismanual,'firestore_presence':True,'source_document_paths':'liturgicalYearOverrides/'+y['id'],'source_change':y['source'],'confidence':'HIGH actual document and locally reproduced effect; normative scope of exceptional move stated separately','commission_required':commission,'web_default_and_alternatives':J(cs),'firestore_default_and_alternatives':J(cs),'proposal':'Подтвердить годовое исключение по annual Ordo, не превращая в постоянную дату.' if ismanual else 'Не подтверждать 25.06 без решения о 2033. Снятие stored override само не исправит вычисленный перенос: алгоритм также даёт 25.06; needs-review не блокирует применение.' if special else 'Сохранить вычислимый перенос как материализацию; проверять effectiveDate/computedDate, source, enabled и review policy.','notes':'legacy from/to нормализуются в original/effective, missing source/status → manual/confirmed; поведение совпадает с bundled.' if ismanual else 'source=auto-transfer; status=needs-review; enabled=true; effectiveDate=computedDate; статус review не препятствует runtime применению.'}
 rows.append(r)
 decide('DEC-YEAR-'+y['id'],cl,'Ручной годовой перенос' if ismanual else '2033: Nativity / Sacred Heart' if special else 'Материализованный auto-transfer',r['firestore_date']+'; '+r['notes'],r['proposal'],dia,id,r['firestore_date'],commission,kind='year',source=r['source_document_paths'])
for w in summary['runtimeRuleWitnesses']:
 heart=w['id']=='immaculate-heart';source=NORM['heart' if heart else 'mother'];
 rows.append({'row_id':'RULE-'+w['diocese']+'-'+w['date'],'row_kind':'runtime-rule','categories':'TRANSFER_OR_PRECEDENCE','decision_class':'B','diocese':w['diocese'],'celebration_id':w['id'],'pdf_date':'pentecost+20' if heart else 'pentecost+1','web_date':w['date'],'firestore_date':w['date'],'pdf_rank':'memoria','web_rank':'memoria','firestore_rank':'memoria','normative_occurrence_rank':'memoria-ad-libitum for both' if heart else 'memoria, Marian prevails','web_presence':True,'firestore_presence':True,'web_default_and_alternatives':J({'primary':w['primary'],'alternatives':w['alternatives']}),'firestore_default_and_alternatives':J({'primary':w['primary'],'alternatives':w['alternatives']}),'official_source':source,'confidence':'HIGH primary Roman rule + production-based local reproduction','proposal':'При коллизии оба optional, default feria; сохранить оба воспоминания альтернативами.' if heart else 'Maці Касцёла primary; св. Бонифаций не допустимый второй вариант.','notes':'General rule changes occurrence treatment, not literal permanent PDF rank.'})
decide('B-HEART','B','Беззаганнае Сэрца: совпавшие memoria','21 production occurrence: default обязательное марийное воспоминание, будний день недоступен; уведомление 2671/98/L проверено.','Оба совпавших memoria считать optional в этом году: default будний день, оба доступны как alternative. Не менять постоянный ранг вне коллизии.','all','immaculate-heart','21 occurrences 2025–2035',source=NORM['heart'],kind='rule',owner='Да, общее разрешение B; новый вопрос комиссии не нужен')
decide('B-MOTHER','B','Maці Касцёла / Бонифаций','05.06.2028: Минск/Витебск допускают Бонифация как alternative; после PDF-ранга Пинска/Гродно то же проявится во всех четырёх.','Применить преимущество Maці Касцёла по уведомлению 24.03.2018; убрать второй выбор святого в этой коллизии.','all','mary-mother-church','2028-06-05',source=NORM['mother'],kind='rule',owner='Да, общее разрешение B; новый вопрос комиссии не нужен')
decide('C-HIGH-PRIEST','C','High Priest + другой feast','В коде provisional legal-choice; за 2025–2035 production-входы эту ветку не активировали.','Комиссия: подтвердить особое разрешение двух feast либо выбрать общую схему precedence; до ответа не считать provisional нормой.','all','christ-the-high-priest','pentecost+4','yes',kind='rule',source='src/utils/ordo/display.js:135')
TECH=[
('D-MEMO','Устаревший runtime memo','После synthetic publication fresh engine меняет день, bridge возвращает тот же старый объект.','Инвалидировать memo на definitions epoch; тестировать уже открытые даты после публикации.','src/utils/ordo/runtime.js:22'),
('D-REVALIDATE','Обнаружение новой публикации','При complete cache и том же CONTENT_REVISION запуск не вызывает loader; свежесть не ограничена временем.','Задать явную bounded online revalidation календарных meta/year keys и реакцию на новую revision; content bump — средство доставки, не единственный detector.','src/utils/contentCache.js:48;src/main.js:22'),
('D-FRESH-FLAG','Admin fetchYearOverridesFresh','fresh:true сам по себе возвращает isFresh cache; после admin save UI может получить прежний список.','Admin reload/save response должен действительно перечитывать server; использовать корректный revalidation contract.','src/services/ordoCalendarService.js:113;src/services/yearOverridesAdminService.js:47'),
('D-CACHED-SCHEMA','Совместимость cache schema','Source selector принимает cached schema 99 при revision>3; network loader имеет другой guard.','Единый guard schemaVersion перед применением и network, и restored local cache.','src/utils/ordoCalendarSource.js:11;src/utils/ordoCalendarCache.js:14'),
('D-DOWNGRADE','Откат публикации','После active revision4 применение meta-only revision3 не сбрасывает active4; простое уменьшение meta не является надёжным rollback.','Откат: восстановленный набор под новой большей revision; явно проверять downgrade/reset contract.','src/utils/ordoCalendarCache.js:14;src/utils/ordo/definitions.js:188'),
('D-NOTES-PROMISE','Обновление заметок в сеансе','loadOrdoNotes держит удачную pending promise; второй published reader не вызывается. Сейчас production notes4 проигрывает bundle6.','Если заметки будут обновляться в открытом сеансе, связать их загрузку с notesRevision, сохранив offline fallback.','src/utils/ordoNotesLoader.js:16'),
('D-SAVED-REFRESH','Кнопка обновления сохранённого','refreshSavedContent меняет refresh token и обновляет контент, но не обрабатывает ordo-calendar/year keys и не вызывает calendar refresh.','Включить coherent calendar refresh перед пересборкой дня; не обещать пользователю исправленный календарь от одного обновления текстов.','src/utils/refreshSavedContent.js:4'),
('D-YEAR-REVIEW','Review status и совместимость годовых записей','11 auto enabled needs-review уже участвуют в runtime; 4 manual хранят legacy from/to, поддерживаемые нормализатором.','Утвердить статус-политику и canonical storage для будущей публикации; не удалять 11 materialized rows как лишние праздники.','src/utils/ordo/yearOverrides.js:56;src/utils/ordo/yearPlan.js:115'),
('D-PUBLISH-GATE','Согласованность следующей публикации','Meta revision не доказывает полноту набора; нормализатор может отбросить invalid docs и всё равно принять остаток.','До публикации отдельный manifest counts/hash/schema + полный dry-run; переключать meta последним/атомарно по утверждённому механизму.','src/utils/ordo/definitions.js:148;src/services/ordoCalendarService.js:50'),
]
for id,issue,facts,proposal,source in TECH:decide(id,'D',issue,facts,proposal,'all',kind='technical',source=source,confidence='HIGH isolated reproduction' if id not in ['D-SAVED-REFRESH','D-YEAR-REVIEW','D-PUBLISH-GATE'] else 'HIGH source inspection and production metadata')
csvwrite(O/'PRODUCTION_DIFF.csv',rows);csvwrite(O/'DECISION_MATRIX.csv',decisions)
# Safe metadata only. Never copy the private collection payloads or note bodies.
manifest=read(W/'private/manifest.json');ledger=read(W/'private/request-ledger.json')
safe_manifest={'projectId':manifest['projectId'],'schemaVersion':summary['meta']['schemaVersion'],'revision':summary['meta']['revision'],'notesRevision':summary['meta']['notesRevision'],'publishedAt':summary['meta']['publishedAt'],'snapshotExportedAt':manifest['exportedAt'],'metaBookendsStable':manifest['metaBookendsStable'],'notesCount':1337,'notesBodiesRead':False,'bundledNotesRevision':6,'requests':6,'documentPayloadsReturned':333,'distinctDocumentPayloads':332,'aggregationCountQuery':1,'billingExact':'not measured; payload count is not a billing guarantee','collections':{k:{f:v[f] for f in ['documentCount','sha256','requests'] if f in v} for k,v in manifest['collections'].items()},'noWrites':True,'nonCalendarCollectionsRead':[],'sourceSnapshotPrivateNotCommitted':True}
(E/'firestore-read-summary.json').write_text(json.dumps(safe_manifest,ensure_ascii=False,indent=2)+'\n');(E/'request-ledger.json').write_text(json.dumps(ledger,ensure_ascii=False,indent=2)+'\n')
for name in ['production-summary.json','canonical-comparison.json','cache-probes.json','normative-projections.json']:shutil.copyfile(W/name,E/name)
for f in (W/'logs').glob('*.log'):shutil.copyfile(f,E/f.name)
# Each added calendar document has an independently comparable safe hash, not a full database export.
stat={'productionDiffRows':len(rows),'productionDiffKinds':dict(collections.Counter(x['row_kind'] for x in rows)),'decisionRows':len(decisions),'classes':dict(collections.Counter(x['class'] for x in decisions)),'mandatoryCommissionRows':sum(x['commission_required']=='yes' for x in decisions),'substantivePermanentRows':[]}
mask={'EXTRA_NOT_IN_OWN_CALENDAR','MISSING','RANK','DATE','DIOCESE_SCOPE','PARSER_UNCERTAIN'}
sub=[x for x in rows if x['row_kind']=='permanent' and set(x['categories'].split('|'))&mask]
stat['substantivePermanentRows']=len(sub);stat['substantiveByDiocese']=dict(collections.Counter(x['diocese'] for x in sub));stat['confirmedRankConflicts']=sum('RANK' in x['categories'].split('|') for x in sub);stat['confirmedDateConflicts']=sum('DATE' in x['categories'].split('|') for x in sub);stat['additionalAssignments']=sum('EXTRA_NOT_IN_OWN_CALENDAR' in x['categories'].split('|') for x in sub);stat['missingAssignments']=sum('MISSING' in x['categories'].split('|') for x in sub)
stat['commissionDistinctCases']=len(set('C-BRASLAU' if x['issue']=='Identity Braslau/Nativity' else x['decision_id'] for x in decisions if x['commission_required']=='yes'))
stat['commissionPermanentDistinctCases']=len(set('C-BRASLAU' if x['issue']=='Identity Braslau/Nativity' else x['decision_id'] for x in decisions if x['commission_required']=='yes' and x['kind']=='permanent'))
stat['normativeIssueOccurrences']=len(summary['runtimeRuleWitnesses']);stat['heartOccurrences']=sum(w['id']=='immaculate-heart' for w in summary['runtimeRuleWitnesses']);stat['motherChurchOccurrences']=sum(w['id']=='mary-mother-church' for w in summary['runtimeRuleWitnesses']);stat['sourceComparison']='316 permanent documents equal after only importedAt/createdAt/updatedAt excluded; 4 manual canonically equal; 11 auto document additions'
assert len(sub)==48 and stat['additionalAssignments']==23 and stat['confirmedRankConflicts']==17 and stat['confirmedDateConflicts']==3
assert len({x['decision_id'] for x in decisions})==len(decisions)
(E/'final-summary.json').write_text(json.dumps(stat,ensure_ascii=False,indent=2)+'\n');print(json.dumps(stat,ensure_ascii=False,indent=2))
