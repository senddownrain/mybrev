import { writeFile } from 'node:fs/promises';
import admin from 'firebase-admin';
import serviceAccount from './serviceAccountKey.json' with { type: 'json' };

const SOURCE_COLLECTION = 'oldDays';
const TARGET_COLLECTION = 'dayTemplates';
const TARGET_PERIODS = ['lent', 'holyweek', 'easter', 'christmas', 'easterOctave', 'christmasOctave'];
const YEARS_DESC = [2025, 2024, 2023, 2022, 2021, 2020, 2019];

const LITURGICAL_RANGES = [
  { year: 2019, lent: [['2019-03-10','2019-03-16'],['2019-03-17','2019-03-23'],['2019-03-24','2019-03-30'],['2019-03-31','2019-04-06']], holyweek: ['2019-04-14','2019-04-20'], easter: [['2019-04-21','2019-04-27'],['2019-04-28','2019-05-04'],['2019-05-05','2019-05-11'],['2019-05-12','2019-05-18'],['2019-05-19','2019-05-25']], christmas: ['2019-12-25','2020-01-12'] },
  { year: 2020, lent: [['2020-03-01','2020-03-07'],['2020-03-08','2020-03-14'],['2020-03-15','2020-03-21'],['2020-03-22','2020-03-28']], holyweek: ['2020-04-05','2020-04-11'], easter: [['2020-04-12','2020-04-18'],['2020-04-19','2020-04-25'],['2020-04-26','2020-05-02'],['2020-05-03','2020-05-09'],['2020-05-10','2020-05-16']], christmas: ['2020-12-25','2021-01-10'] },
  { year: 2021, lent: [['2021-02-21','2021-02-27'],['2021-02-28','2021-03-06'],['2021-03-07','2021-03-13'],['2021-03-14','2021-03-20']], holyweek: ['2021-03-28','2021-04-03'], easter: [['2021-04-04','2021-04-10'],['2021-04-11','2021-04-17'],['2021-04-18','2021-04-24'],['2021-04-25','2021-05-01'],['2021-05-02','2021-05-08']], christmas: ['2021-12-25','2022-01-09'] },
  { year: 2022, lent: [['2022-03-06','2022-03-12'],['2022-03-13','2022-03-19'],['2022-03-20','2022-03-26'],['2022-03-27','2022-04-02']], holyweek: ['2022-04-10','2022-04-16'], easter: [['2022-04-17','2022-04-23'],['2022-04-24','2022-04-30'],['2022-05-01','2022-05-07'],['2022-05-08','2022-05-14'],['2022-05-15','2022-05-21']], christmas: ['2022-12-25','2023-01-08'] },
  { year: 2023, lent: [['2023-02-26','2023-03-04'],['2023-03-05','2023-03-11'],['2023-03-12','2023-03-18'],['2023-03-19','2023-03-25']], holyweek: ['2023-04-02','2023-04-08'], easter: [['2023-04-09','2023-04-15'],['2023-04-16','2023-04-22'],['2023-04-23','2023-04-29'],['2023-04-30','2023-05-06'],['2023-05-07','2023-05-13']], christmas: ['2023-12-25','2024-01-07'] },
  { year: 2024, lent: [['2024-02-18','2024-02-24'],['2024-02-25','2024-03-02'],['2024-03-03','2024-03-09'],['2024-03-10','2024-03-16']], holyweek: ['2024-03-24','2024-03-30'], easter: [['2024-03-31','2024-04-06'],['2024-04-07','2024-04-13'],['2024-04-14','2024-04-20'],['2024-04-21','2024-04-27'],['2024-04-28','2024-05-04']], christmas: ['2024-12-25','2025-01-12'] },
  { year: 2025, lent: [['2025-03-09','2025-03-15'],['2025-03-16','2025-03-22'],['2025-03-23','2025-03-29'],['2025-03-30','2025-04-05']], holyweek: ['2025-04-13','2025-04-19'], easter: [['2025-04-20','2025-04-26'],['2025-04-27','2025-05-03'],['2025-05-04','2025-05-10'],['2025-05-11','2025-05-17'],['2025-05-18','2025-05-24']], christmas: ['2025-12-25','2026-01-11'] },
];

const PERIOD_LABELS = { lent: 'Вялікі пост', holyweek: 'Страсны тыдзень', easter: 'Велікодны перыяд', christmas: 'Перыяд Божага Нараджэння' };
const WEEKDAY_LABELS = { 1: 'Нядзеля', 2: 'Панядзелак', 3: 'Аўторак', 4: 'Серада', 5: 'Чацвер', 6: 'Пятніца', 7: 'Субота' };

const FIELDS_LENT_EASTER = ['laudesAnt1','laudesAnt2','laudesAnt3','laudesPs1','laudesPs2','laudesPs3','sext1Ant1','sext1Ant2','sext1Ant3','sext1Ps1','sext1Ps2','sext1Ps3','sext2Ant1','sext2Ant2','sext2Ant3','sext2Ps1','sext2Ps2','sext2Ps3','sext3Ant1','sext3Ant2','sext3Ant3','sext3Ps1','sext3Ps2','sext3Ps3','vesperAnt1','vesperAnt2','vesperAnt3','vesperPs1','vesperPs2','vesperPs3','vesper1Ant1','vesper1Ant2','vesper1Ant3','vesper1Ps1','vesper1Ps2','vesper1Ps3'];
const FIELDS_CHRISTMAS = FIELDS_LENT_EASTER;
const FIELDS_HOLYWEEK = [
'invitatoriumAnt','officeOfReadingsHymn','officeOfReadingsAnt1','officeOfReadingsAnt2','officeOfReadingsAnt3','officeOfReadingsPs1','officeOfReadingsPs2','officeOfReadingsPs3','officeOfReadingsVers','officeOfReadingsR1','officeOfReadingsR2','officeOfReadingsTeDeum','officeOfReadingsPr','laudesHymn','laudesAnt1','laudesAnt2','laudesAnt3','laudesPs1','laudesPs2','laudesPs3','laudesR','laudesAntBen','laudesInter','laudesPr','sext1Hymn','sext1Ant1','sext1Ant2','sext1Ant3','sext1Ps1','sext1Ps2','sext1Ps3','sext1R','sext1Pr','sext2Hymn','sext2Ant1','sext2Ant2','sext2Ant3','sext2Ps1','sext2Ps2','sext2Ps3','sext2R','sext2Pr','sext3Hymn','sext3Ant1','sext3Ant2','sext3Ant3','sext3Ps1','sext3Ps2','sext3Ps3','sext3R','sext3Pr','vesperHymn','vesperAnt1','vesperAnt2','vesperAnt3','vesperPs1','vesperPs2','vesperPs3','vesperR','vesperAntMag','vesperInter','vesperPr','vesper1Hymn','vesper1Ant1','vesper1Ant2','vesper1Ant3','vesper1Ps1','vesper1Ps2','vesper1Ps3','vesper1R','vesper1AntMag','vesper1Inter','vesper1Pr'];
const OCTAVE_FIELDS = ['laudesHymn','laudesAnt1','laudesAnt2','laudesAnt3','laudesPs1','laudesPs2','laudesPs3','sext1Hymn','sext1Ant1','sext1Ant2','sext1Ant3','sext1Ps1','sext1Ps2','sext1Ps3','sext2Hymn','sext2Ant1','sext2Ant2','sext2Ant3','sext2Ps1','sext2Ps2','sext2Ps3','sext3Hymn','sext3Ant1','sext3Ant2','sext3Ant3','sext3Ps1','sext3Ps2','sext3Ps3','vesperHymn','vesperAnt1','vesperAnt2','vesperAnt3','vesperPs1','vesperPs2','vesperPs3','vesper1Hymn','vesper1Ant1','vesper1Ant2','vesper1Ant3','vesper1Ps1','vesper1Ps2','vesper1Ps3'];

const chunk=(arr,size=400)=>Array.from({length:Math.ceil(arr.length/size)},(_,i)=>arr.slice(i*size,(i+1)*size));
const ymdToDate=(s)=>new Date(`${s}T00:00:00Z`); const addDays=(s,d)=>{const x=ymdToDate(s);x.setUTCDate(x.getUTCDate()+d);return x.toISOString().slice(0,10);};
const dateRange=(a,b)=>{const out=[];for(let d=a;d<=b;d=addDays(d,1))out.push(d);return out;};
const asNullable=(v)=>v===undefined?null:v; const dow=(s)=>{const x=ymdToDate(s).getUTCDay();return x===0?1:x+1;};

function parsePsalmWeek(raw){ if(!raw)return null; const m=String(raw).toUpperCase().replace(/І/g,'I').replace(/\s+/g,' ').trim().match(/\b(IV|III|II|I)\b\s+ТЫДЗЕНЬ\s+ПСАЛТЫРА/i); return m?({I:1,II:2,III:3,IV:4}[m[1]]??null):null; }

function periodFields(period){ if(period==='holyweek') return FIELDS_HOLYWEEK; if(period==='christmas') return FIELDS_CHRISTMAS; return FIELDS_LENT_EASTER; }

function buildPayload(row, byDate, dateStr, period, psalmWeek, dayOfWeek, report){
  const p={_title:`${psalmWeek} тыдзень, ${WEEKDAY_LABELS[dayOfWeek]||dayOfWeek}, ${PERIOD_LABELS[period]||period}`,_checkedAt:null,_dayOfWeek:dayOfWeek,_isChecked:false,_periodType:period,_psalmWeekNumber:psalmWeek};
  const fields=periodFields(period); for(const f of fields) p[f]=asNullable(row[f]);

  if(fields.includes('vesper1Ant1')){
    const sat=byDate.get(addDays(dateStr,-1));
    if(dayOfWeek===1 && sat){
      if(fields.includes('vesper1Hymn')) p.vesper1Hymn=asNullable(sat.vesperHymn);
      p.vesper1Ant1=asNullable(sat.vesperAnt1); p.vesper1Ant2=asNullable(sat.vesperAnt2); p.vesper1Ant3=asNullable(sat.vesperAnt3);
      p.vesper1Ps1=asNullable(sat.vesperPs1); p.vesper1Ps2=asNullable(sat.vesperPs2); p.vesper1Ps3=asNullable(sat.vesperPs3);
      if(fields.includes('vesper1R')) p.vesper1R=asNullable(sat.vesperR);
      if(fields.includes('vesper1AntMag')) p.vesper1AntMag=asNullable(sat.vesperAntMag);
      if(fields.includes('vesper1Inter')) p.vesper1Inter=asNullable(sat.vesperInter);
      if(fields.includes('vesper1Pr')) p.vesper1Pr=asNullable(sat.vesperPr);
    }
    if(dayOfWeek===1 && !sat) report.stats[period].missingSaturdayForVesper1.push({sunday:dateStr,saturdayExpected:addDays(dateStr,-1)});
  }

  if((period==='lent' || period==='easter') && dayOfWeek===1){
    p.vesperAnt1=null; p.vesperAnt2=null; p.vesperAnt3=null; p.vesper1Ant1=null; p.vesper1Ant2=null; p.vesper1Ant3=null;
  }

  return p;
}

function flattenDates(y,period){
  if(period==='lent' || period==='easter') return y[period].flatMap(([a,b])=>dateRange(a,b));
  const [a,b]=y[period]; return dateRange(a,b);
}

function expectedSlots(period){
  if(period==='holyweek') return Array.from({length:7},(_,i)=>`holyweek-psalmweek-1-day-${i+1}`);
  if(period==='lent' || period==='easter') { const ids=[]; for(let w=1;w<=4;w++) for(let d=1;d<=7;d++) ids.push(`${period}-psalmweek-${w}-day-${d}`); return ids; }
  return null;
}

async function main(){
  admin.initializeApp({credential:admin.credential.cert(serviceAccount)}); const db=admin.firestore();
  const src=await db.collection(SOURCE_COLLECTION).where(admin.firestore.FieldPath.documentId(),'>=','2019-02-01').where(admin.firestore.FieldPath.documentId(),'<=','2026-01-31').orderBy(admin.firestore.FieldPath.documentId()).get();
  const byDate=new Map(src.docs.map(d=>[d.id,{id:d.id,...d.data()}]));

  let deleted=0;
  for(const period of TARGET_PERIODS){ const s=await db.collection(TARGET_COLLECTION).where('_periodType','==',period).get(); for(const c of chunk(s.docs)){const b=db.batch(); for(const d of c){b.delete(d.ref); deleted++;} await b.commit();} }

  const report={sourceCollection:SOURCE_COLLECTION,deletedTemplates:deleted,yearsScanned:YEARS_DESC,totalRowsLoaded:src.size,stats:{}};
  for(const p of ['lent','holyweek','easter','christmas']) report.stats[p]={createdTemplates:0,missingPsalmWeek:[],missingDayRowsByYear:{},missingSaturdayForVesper1:[],missingTemplateSlots:[],filledFrom:{}};

  const perMap={lent:new Map(),holyweek:new Map(),easter:new Map(),christmas:new Map()};
  const byYear=new Map(LITURGICAL_RANGES.map(x=>[x.year,x]));

  for(const year of YEARS_DESC){
    const cfg=byYear.get(year);
    for(const period of ['lent','holyweek','easter','christmas']){
      report.stats[period].missingDayRowsByYear[year]=[];
      for(const ds of flattenDates(cfg,period)){
        const row=byDate.get(ds); if(!row || row._periodType!==period){ report.stats[period].missingDayRowsByYear[year].push(ds); continue; }

        if(period==='easter'){ const pw=Number(row._periodWeekNumber); if(!Number.isInteger(pw)||pw<2||pw>5) continue; }

        const ps=parsePsalmWeek(row._feastName); if(!ps){ report.stats[period].missingPsalmWeek.push({date:ds,feastName:row._feastName??null}); continue; }
        const day=Number(row._dayOfWeek)||dow(ds); const id=`${period}-psalmweek-${ps}-day-${day}`; if(perMap[period].has(id)) continue;
        perMap[period].set(id,{id,payload:buildPayload(row,byDate,ds,period,ps,day,report)});
        report.stats[period].filledFrom[id]={year,date:ds};
      }
    }
  }

  const writes=[];
  for(const period of ['lent','holyweek','easter','christmas']){
    writes.push(...Array.from(perMap[period].values()));
    report.stats[period].createdTemplates=perMap[period].size;
    const exp=expectedSlots(period); if(exp) for(const id of exp) if(!perMap[period].has(id)) report.stats[period].missingTemplateSlots.push(id);
  }

  // Octaves
  const easterSource=byDate.get('2025-04-20');
  const christmasSource=byDate.get('2025-12-25');
  report.stats.easterOctave={created:false,sourceDate:'2025-04-20'};
  report.stats.christmasOctave={created:false,sourceDate:'2025-12-25'};
  if(easterSource){
    const p={_title:'Актава Вялікадня',_checkedAt:null,_dayOfWeek:1,_isChecked:false,_periodType:'easterOctave',_psalmWeekNumber:1};
    for(const f of OCTAVE_FIELDS) p[f]=asNullable(easterSource[f]);
    const sat=byDate.get('2025-04-19'); if(sat){ p.vesper1Hymn=asNullable(sat.vesperHymn); p.vesper1Ant1=asNullable(sat.vesperAnt1); p.vesper1Ant2=asNullable(sat.vesperAnt2); p.vesper1Ant3=asNullable(sat.vesperAnt3); p.vesper1Ps1=asNullable(sat.vesperPs1); p.vesper1Ps2=asNullable(sat.vesperPs2); p.vesper1Ps3=asNullable(sat.vesperPs3); }
    writes.push({id:'easterOctave-template',payload:p}); report.stats.easterOctave.created=true;
  }
  if(christmasSource){
    const p={_title:'Актава Божага Нараджэння',_checkedAt:null,_dayOfWeek:4,_isChecked:false,_periodType:'christmasOctave',_psalmWeekNumber:1};
    for(const f of OCTAVE_FIELDS) p[f]=asNullable(christmasSource[f]);
    const sat=byDate.get('2025-12-24'); if(sat){ p.vesper1Hymn=asNullable(sat.vesperHymn); p.vesper1Ant1=asNullable(sat.vesperAnt1); p.vesper1Ant2=asNullable(sat.vesperAnt2); p.vesper1Ant3=asNullable(sat.vesperAnt3); p.vesper1Ps1=asNullable(sat.vesperPs1); p.vesper1Ps2=asNullable(sat.vesperPs2); p.vesper1Ps3=asNullable(sat.vesperPs3); }
    writes.push({id:'christmasOctave-template',payload:p}); report.stats.christmasOctave.created=true;
  }

  for(const c of chunk(writes)){const b=db.batch(); for(const r of c)b.set(db.collection(TARGET_COLLECTION).doc(r.id),r.payload,{merge:false}); await b.commit();}

  await writeFile(new URL('./json/other-periods-day-templates-regeneration-report.json',import.meta.url),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
  const hasGaps=['lent','holyweek','easter','christmas'].some(p=>report.stats[p].missingPsalmWeek.length||report.stats[p].missingSaturdayForVesper1.length||report.stats[p].missingTemplateSlots.length);
  if(hasGaps) process.exitCode=2;
}

main().catch((e)=>{console.error(e);process.exit(1);});
