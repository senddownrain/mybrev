import path from 'node:path';
import {pathToFileURL} from 'node:url';
const arg=n=>{const i=process.argv.indexOf(n);if(i<0||!process.argv[i+1])throw new Error('Required '+n);return path.resolve(process.argv[i+1]);};
const repo=arg('--repo'), work=arg('--work');
const moduleFromRepo=f=>import(pathToFileURL(path.join(repo,f)).href);
import fs from 'node:fs';
import assert from 'node:assert/strict';
const {setCalendarDefinitions} = await moduleFromRepo('src/utils/ordo/definitions.js');
const {resolveLiturgicalDate} = await moduleFromRepo('src/utils/ordo/index.js');
const W=work;
const prod=JSON.parse(fs.readFileSync(W+'/private/production-definitions.json'));const summary=JSON.parse(fs.readFileSync(W+'/production-summary.json'));
const results=[];const brief=d=>({primary:{id:d.primary.id,rank:d.primary.rank},alternatives:d.alternatives.map(x=>({id:x.id,rank:x.rank})),suppressed:d.suppressed.map(x=>({id:x.id,reason:x.reason})),firstVespers:d.officeResolution.firstVespers});
try {
 setCalendarDefinitions(prod);
 for(const w of summary.runtimeRuleWitnesses.filter(x=>x.id==='immaculate-heart')){
  const before=resolveLiturgicalDate(w.date,{diocese:w.diocese});
  const selected=[before.primary,...before.alternatives].filter(x=>x.rank==='memoria');
  const changes=selected.map(x=>({year:Number(w.date.slice(0,4)),scope:'diocese',dioceseId:w.diocese,targetCelebrationId:x.id,action:'changeRank',rank:'memoria-ad-libitum',originalDate:w.date,source:'manual',status:'confirmed',reason:'Isolated audit projection of 2671/98/L; never stored'}));
  const after=resolveLiturgicalDate(w.date,{diocese:w.diocese,yearOverrides:changes});
  assert.equal(after.primary.kind,'temporal');assert.equal(after.primary.rank,'feria');
  for(const x of selected)assert.ok(after.alternatives.some(a=>a.id===x.id&&a.rank==='memoria-ad-libitum'));
  results.push({id:'B-HEART',diocese:w.diocese,date:w.date,before:brief(before),expectedAfter:brief(after),method:'in-memory year rank projection; not an implementation patch',status:'PASS'});
 }
 // Mother Church needs the PDF rank restored in Pinsk/Grodno and the competing saint suppressed.
 const next={...prod,dioceseOverrides:prod.dioceseOverrides.filter(x=>!(x.celebrationId==='mary-mother-church'&&['pinsk','grodno'].includes(x.dioceseId)))};
 setCalendarDefinitions(next);
 for(const diocese of ['minsk-mohilev','vitebsk','pinsk','grodno']){
  const before=resolveLiturgicalDate('2028-06-05',{diocese});
  const after=resolveLiturgicalDate('2028-06-05',{diocese,yearOverrides:[{year:2028,scope:'diocese',dioceseId:diocese,targetCelebrationId:'sv-boniface',action:'suppress',originalDate:'2028-06-05',source:'manual',status:'confirmed',reason:'Isolated audit projection of 24 March 2018 notification; never stored'}]});
  assert.equal(after.primary.id,'mary-mother-church');assert.equal(after.primary.rank,'memoria');assert.equal(after.alternatives.length,0);
  results.push({id:'B-MOTHER-CHURCH',diocese,date:'2028-06-05',before:brief(before),expectedAfter:brief(after),method:'PDF rank projection + isolated suppression of competing saint; not an implementation patch',status:'PASS'});
 }
} finally {setCalendarDefinitions(null);}
fs.writeFileSync(W+'/normative-projections.json',JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify({cases:results.length,pass:results.filter(x=>x.status==='PASS').length}));
