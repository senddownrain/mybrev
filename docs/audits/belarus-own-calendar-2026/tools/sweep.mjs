import path from 'node:path';
import { pathToFileURL } from 'node:url';
const arg=(name)=>{const i=process.argv.indexOf(name);if(i<0||!process.argv[i+1])throw new Error('Required '+name);return path.resolve(process.argv[i+1]);};
const repo=arg('--repo');
const W=arg('--work');
const moduleFromRepo=(file)=>import(pathToFileURL(path.join(repo,file)).href);
import fs from 'node:fs';
import { gzipSync } from 'node:zlib';
import assert from 'node:assert/strict';
const { generateLiturgicalYear, resolveLiturgicalDate } = await moduleFromRepo('src/utils/ordo/index.js');
const { buildCalendarLayers } = await moduleFromRepo('src/utils/ordo/layers.js');
const { getYearPlan } = await moduleFromRepo('src/utils/ordo/yearPlan.js');
const { getBundledCalendarDefinitions, setCalendarDefinitions, dateRuleOf } = await moduleFromRepo('src/utils/ordo/definitions.js');
const { selectCalendarSource } = await moduleFromRepo('src/utils/ordoCalendarSource.js');
const dias=['minsk-mohilev','vitebsk','pinsk','grodno'];
const bundled=getBundledCalendarDefinitions();
const summary={contexts:[],invariantFailures:[],normativeRuleIssues:[],ruleCounts:{},roles:{},missingContent:{},anchors:[],sourceSelection:[],hypothesis:'PDF permanent-data projection, same engine/rules and existing year decisions; not an approved or independent normative oracle'};
const states=new Map();
const char=(s)=>JSON.stringify(s);
const csv=(rows)=>rows.map(r=>r.map(x=>'"'+String(x??'').replaceAll('"','""')+'"').join(',')).join('\n')+'\n';
const daysRows=[['diocese','date','period','phase','weekday_sunday_1','primary_id','primary_rank','office_primary_id','office_only','alternatives_json','commemorations_json','suppressed_json','first_vespers_json','evening_json','applied_rules_json']];
const candidatesRows=[['diocese','date','id','rank','role','reason','layer','period','phase']];
const changedRows=[['diocese','date','before_primary','after_primary','before_alternatives','after_alternatives','before_commemorations','after_commemorations','before_suppressed','after_suppressed','before_evening','after_evening']];
const byDayKey=new Map();
function compact(day){return {primary:day.primary.id,primaryRank:day.primary.rank,alternatives:day.alternatives.map(x=>x.id),commemorations:day.commemorations.map(x=>x.id),suppressed:day.suppressed.map(x=>({id:x.id,reason:x.reason})),firstVespers:day.firstVespers||day.officeResolution.firstVespers,evening:day.officeResolution.evening,period:day.period,phase:day.periodPhase};}
function state(dia,id){const key=dia+'|'+id;if(!states.has(key))states.set(key,{diocese:dia,id,roles:{primary:0,alternative:0,commemoration:0,suppressed:0},reasons:{},examples:{},dates:[]});return states.get(key);}
function fail(dia,date,type,detail){summary.invariantFailures.push({diocese:dia,date,type,detail});}
for(const dia of dias){
 const layer=buildCalendarLayers({diocese:dia});
 fs.writeFileSync(`${W}/effective-${dia}.json`,JSON.stringify([...layer.celebrations.values()],null,2));
 for(let y=2025;y<=2035;y++){
  const days=generateLiturgicalYear(y,{diocese:dia}); const counts={};const plan=getYearPlan(y,{diocese:dia});
  summary.anchors.push({diocese:dia,year:y,anchors:plan.anchors,transfers:plan.transfers,appliedOverrides:plan.appliedOverrides,staleTransferOverrides:plan.staleTransferOverrides});
  for(const day of days){
   const c=compact(day);byDayKey.set(dia+'|'+day.date,c);
   daysRows.push([dia,day.date,day.period,day.periodPhase,day.dayOfWeek,day.primary.id,day.primary.rank,day.sources.office.optionId,day.sources.split,char(c.alternatives),char(c.commemorations),char(c.suppressed),char(c.firstVespers),char(c.evening),char(day.appliedRules)]);
   const roles=[['primary',[day.primary]],['alternative',day.alternatives],['commemoration',day.commemorations],['suppressed',day.suppressed]];
   if(day.sources.split){summary.officeOnly=(summary.officeOnly||0)+1;candidatesRows.push([dia,day.date,day.sources.office.optionId,'dominica','office-only','all-souls-sunday-split','universal',day.period,day.periodPhase]);}
   const ids=roles.flatMap(([,a])=>a.map(x=>x.id));
   if(new Set(ids).size!==ids.length)fail(dia,day.date,'non-disjoint-roles',ids);
   for(const [role,items] of roles){for(const item of items){
    counts[role]=(counts[role]||0)+1;summary.roles[role]=(summary.roles[role]||0)+1;
    const s=state(dia,item.id);s.roles[role]++;if(item.reason)s.reasons[item.reason]=(s.reasons[item.reason]||0)+1;
    if(!s.examples[role])s.examples[role]={date:day.date,period:day.period,phase:day.periodPhase,primary:day.primary.id,reason:item.reason||''};
    if(item.kind!=='temporal')s.dates.push({date:day.date,role,reason:item.reason||''});
    candidatesRows.push([dia,day.date,item.id,item.rank,role,item.reason||'',item.layer,day.period,day.periodPhase]);
   }}
   for(const cand of day.candidates)if(!ids.includes(cand.id) && !(day.sources.split && day.sources.office.celebrationId===null && day.sources.office.optionId===cand.id))fail(dia,day.date,'unclassified-candidate',cand.id);
   if(day.primary.rank==='memoria-ad-libitum')fail(dia,day.date,'optional-is-primary',day.primary.id);
   if(['solemnity','feast','memorial'].includes(day.primary.officeKind)&&day.alternatives.some(x=>x.kind==='temporal'))fail(dia,day.date,'weekday-option-under-obligatory',day.primary.id);
   const temporal=day.candidates.find(x=>x.kind==='temporal');
   if(temporal?.precedence===9 && day.primary.kind==='temporal' && day.alternatives.some(x=>['memoria','memoria-ad-libitum'].includes(x.rank)))fail(dia,day.date,'memorial-not-commemoration',day.alternatives);
   if(day.dayOfWeek===1 && day.commemorations.length)fail(dia,day.date,'commemoration-on-sunday',c.commemorations);
   if(c.firstVespers.byRight && !['solemnity','sunday','feast'].includes(day.officeResolution.primary.officeKind||day.primary.officeKind))fail(dia,day.date,'unexpected-first-vespers',day.primary.id);
   for(const rule of day.appliedRules)summary.ruleCounts[rule.rule]=(summary.ruleCounts[rule.rule]||0)+1;
   const mmc=[day.primary,...day.alternatives].find(x=>x.id==='mary-mother-church');
   if(mmc?.rank==='memoria'&&day.alternatives.some(x=>x.rank==='memoria'&&x.category==='saint'))summary.normativeRuleIssues.push({diocese:dia,date:day.date,type:'mother-church-concurrent-memorial',primary:day.primary.id,alternatives:c.alternatives,source:'https://press.vatican.va/content/salastampa/en/bollettino/pubblico/2018/03/27/180327b.html'});
  }
  summary.contexts.push({diocese:dia,year:y,days:days.length,roles:counts,transfers:plan.transfers.length});
 }
}
// A projection of PDF DATA only. Every mutation below affects an isolated Node process;
// no application, database, or tracked source is written.
const projected={};
const supplemental=new Set(['ash-wednesday','palm-sunday','easter-sunday','ascension','pentecost','sv-juan-diego','our-lady-guadalupe']);
const keyrule=r=>{if(/^\d{2}-\d{2}$/.test(r)){const [month,day]=r.split('-').map(Number);return {type:'fixed',month,day};}if(r.startsWith('named:'))return {type:'named',rule:r.slice(6)};if(r.startsWith('pentecost+'))return {type:'movable',anchor:'pentecost',offsetDays:Number(r.split('+')[1])};return {type:'movable',anchor:'firstAdventSunday',offsetDays:-7};};
for(const dia of dias){
 const refs=JSON.parse(fs.readFileSync(`${W}/expected-${dia}.json`));
 const current=JSON.parse(fs.readFileSync(`${W}/effective-${dia}.json`));const map=new Map(current.map(x=>[x.id,x]));
 const defs=[];
 for(const [id,r] of Object.entries(refs)){
  if(id==='our-lady-braslau')continue; // identity unresolved: retain current alias in base projection
  const old=map.get(id)||{layer:r.dioceses?'diocese':(r.status==='belarus'?'belarus':'universal'),...(r.dioceses?{dioceseId:dia}: {})};
  defs.push({...old,layer:r.dioceses?'diocese':(r.status==='belarus'?'belarus':'universal'),id,title:old.title||r.title,rank:r.rank,scope:old.layer==='belarus'?'belarus':'universal',dateRule:keyrule(r.date),enabled:true,order:defs.length,...(!old.id?{category:/панны марыі/i.test(r.title)?'mary':'saint',color:'albus',contentStatus:{hours:'unverified-missing',readings:'unverified-missing'}}:{})});
 }
 // Preserve the Vitebsk Braslau alias as a declared unresolved assumption,
 // so a data diff cannot be misrepresented as a decision about two feasts.
 if(dia==='vitebsk'){
  const e=defs.find(x=>x.id==='nativity-blessed-virgin-mary');const old=map.get(e.id);Object.assign(e,{title:old.title,layer:old.layer,dioceseId:dia});
 }
 for(const old of current)if(supplemental.has(old.id)&&!defs.some(x=>x.id===old.id))defs.push({...old,scope:'universal',dateRule:dateRuleOf(old.date),enabled:true,order:defs.length});
 // Encode each effective celebration as a base definition or a full diocesan ADD,
 // preserving precedence row, metadata and proper scope of the existing model.
 const base=[];const overrides=[];
 for(const def of defs){
  const {layer,dioceseId,date,inheritedFrom,layerTrail,...rest}=def;
  if(layer==='diocese')overrides.push({...rest,id:dia+'--'+def.id,celebrationId:def.id,dioceseId:dia,action:'add'});
  else base.push(rest);
 }
 const scenario={...bundled,celebrations:base,dioceseOverrides:overrides}; projected[dia]=scenario;
 setCalendarDefinitions(scenario);
 for(let y=2025;y<=2035;y++){
 setCalendarDefinitions(y===2025?{...scenario,celebrations:scenario.celebrations.filter(x=>x.id!=='sv-john-henry-newman')}:scenario);
 for(const day of generateLiturgicalYear(y,{diocese:dia})){
  const b=byDayKey.get(dia+'|'+day.date),a=compact(day);
  if([day.primary,...day.alternatives].some(x=>x.id==='mary-mother-church'&&x.rank==='memoria')&&[day.primary,...day.alternatives].some(x=>x.rank==='memoria'&&x.category==='saint')){(summary.projectionNormativeRuleIssues ||= []).push({diocese:dia,date:day.date,primary:day.primary.id,alternatives:a.alternatives});}
  // Rank changes remain visible even if primary identity is unchanged.
  if(JSON.stringify(b)!==JSON.stringify(a))changedRows.push([dia,day.date,b.primary,a.primary,char(b.alternatives),char(a.alternatives),char(b.commemorations),char(a.commemorations),char(b.suppressed),char(a.suppressed),char(b.evening),char(a.evening)]);
 }
 }
 setCalendarDefinitions(null);
}
summary.totalDays=summary.contexts.reduce((a,x)=>a+x.days,0);
summary.projectedDays=summary.totalDays;
summary.changedDays=changedRows.length-1;
summary.states=[...states.values()];
// Test the production source selection contract using synthetic definitions only.
for(const [name,cached,expected] of [['missing',null,'bundled'],['equal',{revision:3,celebrations:[{id:'synthetic'}]},'bundled'],['newer',{revision:4,celebrations:[{id:'synthetic'}]},'firestore'],['empty-newer',{revision:4,celebrations:[]},'bundled']]){const actual=selectCalendarSource({bundled,cached});assert.equal(actual,expected);summary.sourceSelection.push({name,actual,expected});}
const cases=[['pinsk','2026-12-04'],['grodno','2026-12-04'],['pinsk','2026-07-02'],['minsk-mohilev','2026-07-02'],['vitebsk','2026-07-02'],['grodno','2027-07-05'],['grodno','2027-07-10'],['pinsk','2026-08-22'],['pinsk','2026-05-25'],['grodno','2026-05-25'],['vitebsk','2026-11-16'],['vitebsk','2026-09-08'],['vitebsk','2026-06-12'],['vitebsk','2026-11-12'],['minsk-mohilev','2026-11-12'],['pinsk','2026-11-12'],['grodno','2026-11-12'],['vitebsk','2026-02-15'],['vitebsk','2027-02-15'],['minsk-mohilev','2026-10-09'],['grodno','2027-12-04'],['grodno','2027-12-06']];
const caseResults=[];
for(const [dia,date] of cases){setCalendarDefinitions(null);const b=compact(resolveLiturgicalDate(date,{diocese:dia}));setCalendarDefinitions(projected[dia]);const a=compact(resolveLiturgicalDate(date,{diocese:dia}));caseResults.push({diocese:dia,date,before:b,after:a,scenario:'PDF-DATA-ONLY; Braslau alias unresolved; year overrides retained'});}
// These assertions are fixed acceptance expectations from the PDF, not generated assertions.
const checks=[
 ['pinsk','2026-12-04','temporal:advent-w1-d6','temporal:advent-w1-d6',['sv-john-damascene']],
 ['grodno','2026-12-04','grodno-cathedral-dedication','grodno-cathedral-dedication',[]],
 ['pinsk','2026-07-02','our-lady-budslav','temporal:ordinary-w13-d5',['our-lady-budslav']],
 ['minsk-mohilev','2026-07-02','our-lady-budslav','our-lady-budslav',[]],
 ['vitebsk','2026-07-02','our-lady-budslav','our-lady-budslav',[]],
 ['grodno','2027-07-05','temporal:ordinary-w14-d2','our-lady-trakai',[]],
 ['grodno','2027-07-10','our-lady-trakai','temporal:ordinary-w14-d7',['saturday-blessed-virgin-mary']],
 ['pinsk','2026-08-22','our-lady-lahishyn','our-lady-queen',[]],
 ['pinsk','2026-05-25','mary-mother-church','mary-mother-church',[]],
 ['grodno','2026-05-25','mary-mother-church','mary-mother-church',[]],
 ['vitebsk','2026-11-16','our-lady-mother-mercy','temporal:ordinary-w33-d2',['our-lady-mother-mercy','sv-margaret-scotland','sv-gertrude']],
 ['minsk-mohilev','2026-10-09','temporal:ordinary-w27-d6','temporal:ordinary-w27-d6',['sv-denis-companions','sv-john-leonardi','sv-john-henry-newman']]
];
summary.fixedAcceptanceCases=[];
for(const [diocese,date,beforePrimary,afterPrimary,afterAlternatives] of checks){
 const actual=caseResults.find(x=>x.diocese===diocese&&x.date===date);
 assert.equal(actual.before.primary,beforePrimary);assert.equal(actual.after.primary,afterPrimary);assert.deepEqual(actual.after.alternatives,afterAlternatives);
 summary.fixedAcceptanceCases.push({diocese,date,beforePrimary,afterPrimary,afterAlternatives,status:'PASS'});
}
summary.acceptanceRankChecks=[];
for(const diocese of ['pinsk','grodno']){setCalendarDefinitions(projected[diocese]);assert.equal(resolveLiturgicalDate('2026-05-25',{diocese}).primary.rank,'memoria');summary.acceptanceRankChecks.push({diocese,date:'2026-05-25',expectedRank:'memoria',status:'PASS'});}
setCalendarDefinitions(projected.grodno);assert.equal(resolveLiturgicalDate('2027-07-05',{diocese:'grodno'}).primary.rank,'memoria');
summary.acceptanceRankChecks.push({diocese:'grodno',date:'2027-07-05',expectedRank:'memoria',status:'PASS'});
setCalendarDefinitions(null);
// Alternative Vitebsk identity scenario, without resolving its normative legitimacy.
setCalendarDefinitions(projected.vitebsk);
const nat=projected.vitebsk.dioceseOverrides.find(x=>x.celebrationId==='nativity-blessed-virgin-mary');
const two=structuredClone(projected.vitebsk);
two.dioceseOverrides=two.dioceseOverrides.filter(x=>x.celebrationId!=='nativity-blessed-virgin-mary');
two.celebrations.push({...nat,id:'nativity-blessed-virgin-mary',title:'Нараджэнне Найсв. Панны Марыі',scope:'universal'});
two.dioceseOverrides.push({...nat,id:'vitebsk--our-lady-braslau',celebrationId:'our-lady-braslau'});
setCalendarDefinitions(two);summary.braslauTwoIdentityScenario=compact(resolveLiturgicalDate('2026-09-08',{diocese:'vitebsk'}));
setCalendarDefinitions(null);
// Annual decisions versus pure algorithm, in a separate scenario.
summary.yearOverrideCases=[];
for(const o of bundled.yearOverrides){
 for(const date of [o.originalDate,o.effectiveDate]){
  const b=compact(resolveLiturgicalDate(date,{diocese:o.dioceseId}));const a=compact(resolveLiturgicalDate(date,{diocese:o.dioceseId,dataYearOverrides:false}));summary.yearOverrideCases.push({id:o.id,date,diocese:o.dioceseId,stored:b,withoutStored:a});
 }
}
assert.equal(summary.invariantFailures.length,0,'Structural invariants must pass (Office-only All Souls exception is explicit)');
fs.writeFileSync(`${W}/sweep.json`,JSON.stringify(summary,null,2));
fs.writeFileSync(`${W}/cases.json`,JSON.stringify(caseResults,null,2));
fs.writeFileSync(`${W}/daily-current.csv.gz`,gzipSync(csv(daysRows)));
fs.writeFileSync(`${W}/candidate-roles.csv.gz`,gzipSync(csv(candidatesRows)));
fs.writeFileSync(`${W}/daily-projection-diff.csv.gz`,gzipSync(csv(changedRows)));
console.log(JSON.stringify({totalDays:summary.totalDays,projectedDays:summary.projectedDays,changedDays:summary.changedDays,invariants:summary.invariantFailures.length,normativeRuleIssues:summary.normativeRuleIssues.length,roles:summary.roles,ruleCounts:summary.ruleCounts},null,2));
