#!/usr/bin/env node

const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

const YEARS = [2019, 2020, 2021, 2022, 2023, 2024, 2025];
const DATES = [
  '01.01','02.01','03.01','06.01','13.01','17.01','20.01','21.01','22.01','24.01','25.01','26.01','27.01','28.01','29.01','31.01',
  '02.02','03.02','05.02','06.02','08.02','10.02','11.02','14.02','15.02','17.02','21.02','22.02','23.02',
  '04.03','07.03','08.03','09.03','16.03','17.03','18.03','19.03','23.03','25.03',
  '02.04','04.04','05.04','07.04','11.04','13.04','21.04','23.04','24.04','25.04','28.04','29.04','30.04',
  '01.05','02.05','03.05','12.05','13.05','14.05','16.05','18.05','20.05','21.05','22.05','25.05','26.05','27.05','31.05',
  '01.06','02.06','03.06','05.06','06.06','09.06','11.06','12.06','13.06','19.06','21.06','22.06','24.06','27.06','28.06','29.06','30.06',
  '02.07','03.07','04.07','05.07','06.07','09.07','11.07','13.07','14.07','15.07','16.07','20.07','21.07','22.07','23.07','24.07','25.07','26.07','29.07','30.07','31.07',
  '01.08','02.08','04.08','05.08','06.08','07.08','08.08','09.08','10.08','11.08','12.08','13.08','14.08','15.08','16.08','19.08','20.08','21.08','22.08','23.08','24.08','25.08','26.08','27.08','28.08','29.08',
  '03.09','04.09','08.09','09.09','12.09','13.09','14.09','15.09','16.09','17.09','18.09','19.09','20.09','21.09','23.09','26.09','27.09','28.09','29.09','30.09',
  '01.10','02.10','04.10','06.10','07.10','09.10','10.10','14.10','15.10','16.10','17.10','18.10','19.10','22.10','23.10','24.10','26.10','28.10',
  '01.11','02.11','03.11','04.11','09.11','10.11','11.11','12.11','15.11','16.11','17.11','18.11','20.11','21.11','22.11','23.11','24.11','25.11','30.11',
  '03.12','04.12','06.12','07.12','08.12','11.12','13.12','14.12','21.12','23.12','25.12','26.12','27.12','28.12','29.12','31.12',
];

const FIELDS = ['_date','_feastName','_feastType','_feast','feastComment','invitatoriumAnt','officeOfReadingsHymn','officeOfReadingsAnt1','officeOfReadingsAnt2','officeOfReadingsAnt3','officeOfReadingsPs1','officeOfReadingsPs2','officeOfReadingsPs3','officeOfReadingsVers','officeOfReadingsR1','officeOfReadingsR2','officeOfReadingsTeDeum','officeOfReadingsPr','laudesHymn','laudesAnt1','laudesAnt2','laudesAnt3','laudesPs1','laudesPs2','laudesPs3','laudesR','laudesAntBen','laudesInter','laudesPr','sext1Hymn','sext1Ant1','sext1Ant2','sext1Ant3','sext1Ps1','sext1Ps2','sext1Ps3','sext1R','sext1Pr','sext2Hymn','sext2Ant1','sext2Ant2','sext2Ant3','sext2Ps1','sext2Ps2','sext2Ps3','sext2R','sext2Pr','sext3Hymn','sext3Ant1','sext3Ant2','sext3Ant3','sext3Ps1','sext3Ps2','sext3Ps3','sext3R','sext3Pr','vesperHymn','vesperAnt1','vesperAnt2','vesperAnt3','vesperPs1','vesperPs2','vesperPs3','vesperR','vesperAntMag','vesperInter','vesperPr','vesper1Hymn','vesper1Ant1','vesper1Ant2','vesper1Ant3','vesper1Ps1','vesper1Ps2','vesper1Ps3','vesper1R','vesper1AntMag','vesper1Inter','vesper1Pr'];

function extractDDMM(value) {
  const m = String(value || '').match(/(\d{2})[.-](\d{2})/);
  return m ? `${m[1]}.${m[2]}` : null;
}

async function main() {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();

  const oldSnap = await db.collection('oldDays').get();
  const docs = oldSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

  const allowed = new Set(DATES);
  const yearSet = new Set(YEARS);

  let written = 0;
  let batch = db.batch();
  let pending = 0;

  for (const item of docs) {
    const y = Number(String(item._date || '').slice(0, 4));
    const ddmm = extractDDMM(item._date);
    if (!yearSet.has(y) || !allowed.has(ddmm)) continue;

    const payload = {};
    FIELDS.forEach((f) => { payload[f] = item[f] ?? null; });
    payload._source = 'oldDays-fixed-calendar';
    payload._fixedDate = ddmm;

    const targetId = `${y}-${ddmm.replace('.', '-')}-${item.id}`.toLowerCase();
    batch.set(db.collection('daysTmp').doc(targetId), payload, { merge: true });
    pending += 1;
    written += 1;

    if (pending >= 400) {
      await batch.commit();
      batch = db.batch();
      pending = 0;
    }
  }

  if (pending) await batch.commit();
  console.log(`Done. Migrated ${written} docs to daysTmp.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
