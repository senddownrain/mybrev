#!/usr/bin/env node
/** Compare an actual production snapshot on the old main with the approved implementation. Local only. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';
import { planApprovedCalendar, calendarHash } from './plan-approved-calendar.mjs';
import { openFirestoreSnapshot } from '../lib/firestore-snapshot.mjs';
import { generateLiturgicalYear } from '../../src/utils/ordo/index.js';
import { getBundledCalendarDefinitions, setCalendarDefinitions } from '../../src/utils/ordo/definitions.js';
import { buildCalendarLayers } from '../../src/utils/ordo/layers.js';
import { LOCAL_CALENDAR_REFERENCES } from '../../src/data/ordo/layers.js';
const args = process.argv.slice(2);
if (args.length !== 6 || args[0] !== '--snapshot' || args[2] !== '--baseline' || args[4] !== '--out') {
  throw new Error('--snapshot <private-local-snapshot> --baseline <local-main-archive> --out <report-directory>');
}
const snapshot = await openFirestoreSnapshot(args[1]);
const { plan, targetCollections } = await planApprovedCalendar(args[1]);
const oldEngine = await import(pathToFileURL(path.resolve(args[3], 'src/utils/ordo/index.js')));
const oldDefinitions = await import(pathToFileURL(path.resolve(args[3], 'src/utils/ordo/definitions.js')));
const oldMeta = await snapshot.document('liturgicalCalendarMeta','current');
oldDefinitions.setCalendarDefinitions({ ...oldMeta, celebrations: await snapshot.collection('liturgicalCelebrations'),
  dioceseOverrides: await snapshot.collection('liturgicalDioceseOverrides'), yearOverrides: await snapshot.collection('liturgicalYearOverrides') });
const summary = d => ({ date: d.date, primary: { id: d.primary.id, title: d.primary.title, rank: d.primary.rank },
  alternatives: d.alternatives.map(x => ({ id: x.id, rank: x.rank })),
  commemorations: d.commemorations.map(x => ({ id: x.id, rank: x.rank })),
  suppressed: d.suppressed.map(x => ({ id: x.id, reason: x.reason, transferredTo: x.transferredTo || null })),
  office: d.officeResolution, readings: d.readingResolution });
const dioceses = ['minsk-mohilev','vitebsk','pinsk','grodno'];
const old = new Map(); const after = new Map(); const delta = []; let cases = 0;
for (const diocese of dioceses) for (let year=2025;year<=2035;year++) {
  const beforeDays = oldEngine.generateLiturgicalYear(year,{diocese});
  const days = generateLiturgicalYear(year,{diocese});
  for (let i=0;i<days.length;i++) {
    cases++;
    const key = `${diocese}/${days[i].date}`;
    const a = summary(beforeDays[i]); const b = summary(days[i]);
    old.set(key,a);after.set(key,b);
    if (calendarHash(a) !== calendarHash(b)) delta.push({diocese,date:days[i].date,before:a,after:b});
  }
}
const byDiocese = Object.fromEntries(dioceses.map(d=>[d,delta.filter(x=>x.diocese===d).length]));
const bundled = getBundledCalendarDefinitions();
let publishedParity = 0;
try {
  setCalendarDefinitions({ ...plan.targetMeta, celebrations: targetCollections.liturgicalCelebrations,
    dioceseOverrides: targetCollections.liturgicalDioceseOverrides, yearOverrides: targetCollections.liturgicalYearOverrides });
  for (const diocese of dioceses) for(let year=2025;year<=2035;year++) {
    for(const day of generateLiturgicalYear(year,{diocese})) {
      if(calendarHash(summary(day))!==calendarHash(after.get(`${diocese}/${day.date}`))) throw new Error(`Published model differs: ${diocese}/${day.date}`);
      publishedParity++;
    }
  }
} finally { setCalendarDefinitions(null); }
const reference = JSON.parse(await fs.readFile(new URL('../../docs/audits/belarus-own-calendar-2026/approved-evidence/reference-2026-11-06.json',import.meta.url)));
const rows=[];
for(const diocese of dioceses){
 const expected=new Map();for(const r of reference)if(!r.dioceses||r.dioceses.split(';').includes(diocese))expected.set(r.celebration_id,r);
 if(diocese==='vitebsk')expected.delete('nativity-blessed-virgin-mary');
 const actual=buildCalendarLayers({diocese}).celebrations;
 for(const [id,r]of expected){const a=actual.get(id);if(!a||a.suppressedBy||a.rank!==r.rank)throw Error(`Source mismatch ${diocese}/${id}`);
  rows.push({diocese,id,date:r.date,rank:r.rank,pdfPage:r.page,sourceReference:r.reference_id,status:'MATCH'});}
}
const out=path.resolve(args[5]);await fs.mkdir(out,{recursive:true});
await fs.writeFile(path.join(out,'DAY_ROLE_DIFF.json.gz'),gzipSync(JSON.stringify(delta)));
await fs.writeFile(path.join(out,'SOURCE_ASSIGNMENT_CHECK.json'),'[\n'+rows.map(row => ` ${JSON.stringify(row)}`).join(',\n')+'\n]\n');
await fs.writeFile(path.join(out,'SWEEP_SUMMARY.json'),JSON.stringify({cases,changedDays:delta.length,byDiocese,publishedParity,
  sourceRows:reference.length,effectiveAssignments:rows.length,hiddenScopedIds:LOCAL_CALENDAR_REFERENCES.map(x=>`${x.dioceseId}--${x.id}`),
  disabledManualIds:bundled.yearOverrides.filter(x=>x.enabled===false).map(x=>x.id),
  includes:['primary','alternatives','commemorations','suppressed','Office','readings/Mass references','I/II Vespers'],
  productionWrites:0,deltaSha256:calendarHash(delta)},null,2)+'\n');
console.log(JSON.stringify({cases,changedDays:delta.length,byDiocese,publishedParity,sourceRows:reference.length,effectiveAssignments:rows.length}));
