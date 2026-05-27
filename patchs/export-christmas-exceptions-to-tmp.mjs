import { db } from './firebase-admin.js'

const FIELDS = [
'_dayOfWeek','_periodType','_periodWeekNumber','_dayName','_date','_feast','_feastName','_feastType','invitatoriumAnt','feastComment','officeOfReadingsHymn','officeOfReadingsAnt1','officeOfReadingsAnt2','officeOfReadingsAnt3','officeOfReadingsPs1','officeOfReadingsPs2','officeOfReadingsPs3','officeOfReadingsVers','officeOfReadingsR1','officeOfReadingsR2','officeOfReadingsTeDeum','officeOfReadingsPr','laudesHymn','laudesAnt1','laudesAnt2','laudesAnt3','laudesPs1','laudesPs2','laudesPs3','laudesR','laudesAntBen','laudesInter','laudesPr','sext1Hymn','sext1Ant1','sext1Ant2','sext1Ant3','sext1Ps1','sext1Ps2','sext1Ps3','sext1R','sext1Pr','sext2Hymn','sext2Ant1','sext2Ant2','sext2Ant3','sext2Ps1','sext2Ps2','sext2Ps3','sext2R','sext2Pr','sext3Hymn','sext3Ant1','sext3Ant2','sext3Ant3','sext3Ps1','sext3Ps2','sext3Ps3','sext3R','sext3Pr','vesperHymn','vesperAnt1','vesperAnt2','vesperAnt3','vesperPs1','vesperPs2','vesperPs3','vesperR','vesperAntMag','vesperInter','vesperPr']

function inRange(date){const [y,m,d]=date.split('-').map(Number);if(y<2019||y>2026)return false;return (m===12&&d>=17)||(m===1&&d<=11)}
const snap=await db.collection('oldDays').get();
const batch=db.batch(); let count=0;
for (const doc of snap.docs){const data=doc.data(); const date=String(data._date||''); if(!inRange(date)) continue; const y=Number(date.slice(0,4)); if(y<2019||y>2025&&!(date.startsWith('2026-01'))) continue; const payload={_sourceId:doc.id}; for(const f of FIELDS) payload[f]=data?.[f]??''; batch.set(db.collection('exceptionsTmp').doc(date),payload,{merge:true}); count++;}
await batch.commit();
console.log('Exported',count)
