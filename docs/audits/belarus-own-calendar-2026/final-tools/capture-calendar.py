"""Bounded READ-ONLY capture for the audited build. Explicit invocation; never a DB writer."""
import argparse,pathlib,urllib.request,urllib.parse,urllib.error,json,datetime,hashlib,os
p=argparse.ArgumentParser();p.add_argument('--repo',required=True);p.add_argument('--out',required=True);p.add_argument('--live-read',action='store_true');a=p.parse_args()
R=pathlib.Path(a.repo).resolve();O=pathlib.Path(a.out).resolve()
if (O/'manifest.json').exists():
 print('Existing local calendar snapshot reused; no network requests.');raise SystemExit(0)
assert a.live_read,'Explicit --live-read is required; use existing private snapshot for offline analysis'
assert R/'docs' not in O.parents and R/'public' not in O.parents,'Private snapshot cannot be captured under docs/public'
assert json.load(open(R/'.firebaserc'))['projects']['default']=='ibreviaryby'
assert os.environ.get('VITE_FIREBASE_PROJECT_ID','ibreviaryby')=='ibreviaryby'
O.mkdir(parents=True,exist_ok=True);O.chmod(0o700);ledger=[];BASE='https://firestore.googleapis.com/v1/projects/ibreviaryby/databases/(default)/documents'
def save(name,x):
 f=O/name;f.write_text(json.dumps(x,ensure_ascii=False,indent=2)+'\n');f.chmod(0o600);return f

def req(resource,params=(),body=None):
 assert len(ledger)<15,'HTTP request budget exhausted'
 assert resource in ['liturgicalCalendarMeta/current','liturgicalCelebrations','liturgicalDioceseOverrides','liturgicalYearOverrides',':runAggregationQuery']
 method='POST' if body is not None else 'GET';assert method=='GET' or resource==':runAggregationQuery'
 url=BASE+('' if resource.startswith(':') else '/')+resource
 if params:url+='?'+urllib.parse.urlencode(params)
 row={'sequence':len(ledger)+1,'method':method,'path':resource,'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'retries':0}
 try:
  request=urllib.request.Request(url,method=method,data=json.dumps(body).encode() if body is not None else None,headers={'Content-Type':'application/json'} if body is not None else {})
  with urllib.request.urlopen(request,timeout=30) as r:b=r.read();row.update(status=r.status,responseBytes=len(b));x=json.loads(b)
  ledger.append(row);save('request-ledger.json',ledger);return x
 except urllib.error.HTTPError as e:
  err=json.loads(e.read() or '{}').get('error',{});row.update(status=e.code,errorStatus=err.get('status'));ledger.append(row);save('request-ledger.json',ledger);raise RuntimeError('Read failed; no retry: '+str(e.code)) from None
 except Exception as e:
  if row not in ledger:row.update(status='TRANSPORT_ERROR',errorType=type(e).__name__);ledger.append(row);save('request-ledger.json',ledger)
  raise

def val(v):
 for k in ['stringValue','doubleValue','booleanValue','nullValue']:
  if k in v:return v[k]
 if 'integerValue' in v:return int(v['integerValue'])
 if 'timestampValue' in v:return {'__firestoreType':'date','iso':v['timestampValue']}
 if 'arrayValue' in v:return [val(x) for x in v['arrayValue'].get('values',[])]
 if 'mapValue' in v:return {k:val(x) for k,x in v['mapValue'].get('fields',{}).items()}
 if 'referenceValue' in v:return {'__firestoreType':'reference','path':v['referenceValue']}
 raise ValueError('Unsupported calendar value type')
def doc(d):return {'id':d['name'].split('/')[-1],'data':{k:val(x) for k,x in d.get('fields',{}).items()},'updateTime':d.get('updateTime')}
mask=[('mask.fieldPaths',f) for f in ['schemaVersion','revision','notesRevision','publishedAt']]
first=req('liturgicalCalendarMeta/current',mask);save('meta-raw.json',first)
meta=doc(first)['data'];notes_revision=json.load(open(R/'src/data/ordo/notes.json'))['revision']
assert meta['notesRevision']<=notes_revision,'Newer published notes require a separately designed bounded notes-body audit for the new build; stop after metadata'
cols={}
for name in ['liturgicalCalendarMeta','liturgicalCelebrations','liturgicalDioceseOverrides','liturgicalYearOverrides']:
 records=[doc(first)] if name=='liturgicalCalendarMeta' else [];requests=1 if records else 0;token=''
 if not records:
  while True:
   params=[('pageSize','1000')]+([('pageToken',token)] if token else [])
   x=req(name,params);requests+=1;records.extend(doc(d) for d in x.get('documents',[]));assert len(records)<=5000
   token=x.get('nextPageToken','')
   if not token:break
 f=save(name+'.json',{'schemaVersion':1,'collectionPath':name,'documents':records});cols[name]={'file':f.name,'documentCount':len(records),'sha256':hashlib.sha256(f.read_bytes()).hexdigest(),'requests':requests}
aggregate=req(':runAggregationQuery',body={'structuredAggregationQuery':{'structuredQuery':{'from':[{'collectionId':'liturgicalOrdoNotes'}]},'aggregations':[{'alias':'calendar_note_count','count':{}}]}});save('notes-count.json',aggregate)
last=req('liturgicalCalendarMeta/current',mask);save('meta-after.json',last)
stable=first.get('fields')==last.get('fields') and first.get('updateTime')==last.get('updateTime')
save('manifest.json',{'schemaVersion':1,'projectId':'ibreviaryby','snapshotVersion':datetime.datetime.now(datetime.timezone.utc).isoformat(),'exportedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'scope':'authorized-read-only-calendar-only','collections':cols,'metaBookendsStable':stable,'requests':len(ledger),'notesBodyRead':False,'noDatabaseWrites':True})
assert stable,'Metadata changed during capture; do not describe as a stable publication'
print(json.dumps({'requests':len(ledger),'counts':{k:v['documentCount'] for k,v in cols.items()},'notesBodiesRead':False,'stableMetadata':stable}))
