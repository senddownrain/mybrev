import { writeFile } from 'node:fs/promises';
import admin from 'firebase-admin';
import serviceAccount from './serviceAccountKey.json' with { type: 'json' };

const SOURCE_COLLECTION = 'oldDays';
const TARGET_COLLECTION = 'dayTemplates';

const ORDINARY_RANGES = [
  { year: 2019, ordinary: [['2019-01-14', '2019-03-05'], ['2019-06-10', '2019-11-30']] },
  { year: 2020, ordinary: [['2020-01-13', '2020-02-25'], ['2020-06-01', '2020-11-28']] },
  { year: 2021, ordinary: [['2021-01-11', '2021-02-16'], ['2021-05-24', '2021-11-27']] },
  { year: 2022, ordinary: [['2022-01-10', '2022-03-01'], ['2022-06-06', '2022-11-26']] },
  { year: 2023, ordinary: [['2023-01-09', '2023-02-21'], ['2023-05-29', '2023-12-02']] },
  { year: 2024, ordinary: [['2024-01-08', '2024-02-13'], ['2024-05-20', '2024-11-30']] },
  { year: 2025, ordinary: [['2025-01-13', '2025-03-04'], ['2025-06-09', '2025-11-29']] },
];
const SEARCH_PHASES = [{ name: 'primary', min: 2, max: 5 }, { name: 'fallback', min: 10, max: 33 }];
const YEARS_DESC = ORDINARY_RANGES.map((x) => x.year).sort((a, b) => b - a);
const WEEKDAY_LABELS = { 1: 'Нядзеля', 2: 'Панядзелак', 3: 'Аўторак', 4: 'Серада', 5: 'Чацвер', 6: 'Пятніца', 7: 'Субота' };

const FIELDS = [
  'invitatoriumAnt','laudesHymn','laudesAnt1','laudesAnt2','laudesAnt3','laudesPs1','laudesPs2','laudesPs3','laudesR','laudesAntBen','laudesInter','laudesPr',
  'sext1Hymn','sext1Ant1','sext1Ant2','sext1Ant3','sext1Ps1','sext1Ps2','sext1Ps3','sext1R','sext1Pr',
  'sext2Hymn','sext2Ant1','sext2Ant2','sext2Ant3','sext2Ps1','sext2Ps2','sext2Ps3','sext2R','sext2Pr',
  'sext3Hymn','sext3Ant1','sext3Ant2','sext3Ant3','sext3Ps1','sext3Ps2','sext3Ps3','sext3R','sext3Pr',
  'vesperHymn','vesperAnt1','vesperAnt2','vesperAnt3','vesperPs1','vesperPs2','vesperPs3','vesperR','vesperAntMag','vesperInter','vesperPr',
  'vesper1Hymn','vesper1Ant1','vesper1Ant2','vesper1Ant3','vesper1Ps1','vesper1Ps2','vesper1Ps3','vesper1R','vesper1AntMag','vesper1Inter','vesper1Pr',
];

const chunk=(arr,size=400)=>Array.from({length:Math.ceil(arr.length/size)},(_,i)=>arr.slice(i*size,(i+1)*size));
const ymdToDate=(s)=>new Date(`${s}T00:00:00Z`);
const addDays=(s,d)=>{const x=ymdToDate(s);x.setUTCDate(x.getUTCDate()+d);return x.toISOString().slice(0,10);};
const dateRange=(a,b)=>{const out=[];for(let d=a;d<=b;d=addDays(d,1))out.push(d);return out;};
const dow=(s)=>{const x=ymdToDate(s).getUTCDay();return x===0?1:x+1;};
const asNullable=(v)=>v===undefined?null:v;

function parsePsalm(raw){
  if(!raw)return null;
  const m=String(raw).toUpperCase().replace(/І/g,'I').replace(/\s+/g,' ').trim().match(/\b(IV|III|II|I)\b\s+ТЫДЗЕНЬ\s+ПСАЛТЫРА/i);
  if(!m)return null; return {I:1,II:2,III:3,IV:4}[m[1]]??null;
}

function derivePsalm(row){
  const p=parsePsalm(row._feastName); if(p) return {value:p,src:'feastName'};
  const w=Number(row._periodWeekNumber); if(Number.isInteger(w)&&w>0){const m=w%4; return {value:m===0?4:m,src:'periodWeekModulo'};}
  return {value:null,src:null};
}

function payload(row, byDate, dateStr, psalmWeekNumber, dayOfWeek, report){
  const p={_title:`${psalmWeekNumber} тыдзень, ${WEEKDAY_LABELS[dayOfWeek]||dayOfWeek}, Звычайны перыяд`,_checkedAt:null,_dayOfWeek:dayOfWeek,_isChecked:false,_periodType:'ordinary',_psalmWeekNumber:psalmWeekNumber};
  for(const f of FIELDS) p[f]=asNullable(row[f]);
  if(dayOfWeek===1){
    const sat=byDate.get(addDays(dateStr,-1));
    if(!sat){report.stats.missingSaturdayForVesper1.push({sunday:dateStr,saturdayExpected:addDays(dateStr,-1)});} else {
      p.vesper1Hymn=asNullable(sat.vesperHymn); p.vesper1Ant1=asNullable(sat.vesperAnt1); p.vesper1Ant2=asNullable(sat.vesperAnt2); p.vesper1Ant3=asNullable(sat.vesperAnt3);
      p.vesper1Ps1=asNullable(sat.vesperPs1); p.vesper1Ps2=asNullable(sat.vesperPs2); p.vesper1Ps3=asNullable(sat.vesperPs3); p.vesper1R=asNullable(sat.vesperR);
      p.vesper1Inter=asNullable(sat.vesperInter); p.vesper1Pr=asNullable(sat.vesperPr);
    }
  }

  if(dayOfWeek===1){
    p.laudesAntBen=null;
    p.vesperAntMag=null;
    p.vesper1AntMag=null;
  }

  return p;
}

async function main(){
  admin.initializeApp({credential:admin.credential.cert(serviceAccount)}); const db=admin.firestore();
  const snap=await db.collection(SOURCE_COLLECTION).where(admin.firestore.FieldPath.documentId(),'>=','2019-01-01').where(admin.firestore.FieldPath.documentId(),'<=','2025-11-29').orderBy(admin.firestore.FieldPath.documentId()).get();
  const byDate=new Map(snap.docs.map(d=>[d.id,{id:d.id,...d.data()}]));

  const existing=await db.collection(TARGET_COLLECTION).where('_periodType','==','ordinary').get();
  for(const c of chunk(existing.docs)){const b=db.batch(); for(const d of c)b.delete(d.ref); await b.commit();}

  const filled=new Map();
  const report={sourceCollection:SOURCE_COLLECTION,deletedTemplates:existing.size,yearsScanned:YEARS_DESC,searchPhases:SEARCH_PHASES,totalRowsLoaded:snap.size,stats:{createdTemplates:0,missingPsalmWeek:[],missingSaturdayForVesper1:[],missingTemplateSlots:[],filledFrom:{}}};

  const mapByYear=new Map(ORDINARY_RANGES.map(r=>[r.year,r]));
  for(const phase of SEARCH_PHASES){
    for(const year of YEARS_DESC){
      const dates=mapByYear.get(year).ordinary.flatMap(([a,b])=>dateRange(a,b));
      for(const ds of dates){
        const row=byDate.get(ds); if(!row||row._periodType!=='ordinary') continue;
        const pw=Number(row._periodWeekNumber); if(!Number.isInteger(pw)||pw<phase.min||pw>phase.max) continue;
        const ps=derivePsalm(row); if(!ps.value){report.stats.missingPsalmWeek.push({date:ds,phase:phase.name,periodWeekNumber:row._periodWeekNumber??null,feastName:row._feastName??null}); continue;}
        const day=Number(row._dayOfWeek)||dow(ds); const id=`ordinary-psalmweek-${ps.value}-day-${day}`; if(filled.has(id)) continue;
        filled.set(id,{id,payload:payload(row,byDate,ds,ps.value,day,report)});
        report.stats.filledFrom[id]={year,date:ds,phase:phase.name,periodWeekNumber:pw,psalmWeekSource:ps.src};
      }
    }
  }

  for(const c of chunk(Array.from(filled.values()))){const b=db.batch(); for(const r of c)b.set(db.collection(TARGET_COLLECTION).doc(r.id),r.payload,{merge:false}); await b.commit();}
  report.stats.createdTemplates=filled.size;
  for(let w=1;w<=4;w++)for(let d=1;d<=7;d++){const id=`ordinary-psalmweek-${w}-day-${d}`; if(!filled.has(id)) report.stats.missingTemplateSlots.push(id);}  

  await writeFile(new URL('./json/ordinary-day-templates-regeneration-report.json',import.meta.url),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
  if(report.stats.missingTemplateSlots.length||report.stats.missingPsalmWeek.length||report.stats.missingSaturdayForVesper1.length) process.exitCode=2;
}

main().catch((e)=>{console.error(e);process.exit(1);});
