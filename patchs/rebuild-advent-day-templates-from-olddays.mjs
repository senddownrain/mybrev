import { writeFile } from 'node:fs/promises';
import admin from 'firebase-admin';
import serviceAccount from './serviceAccountKey.json' with { type: 'json' };

const SOURCE_COLLECTION = 'oldDays';
const TARGET_COLLECTION = 'dayTemplates';

const ADVENT_STARTS = {
  2025: '2025-11-30',
  2024: '2024-12-01',
  2023: '2023-12-03',
  2022: '2022-11-27',
  2021: '2021-11-28',
  2020: '2020-11-29',
  2019: '2019-12-01',
};

const YEARS_DESC = Object.keys(ADVENT_STARTS).map(Number).sort((a, b) => b - a);
const SEARCH_END_SUFFIX = '-12-16';
const WEEKDAY_LABELS = { 1: 'Нядзеля', 2: 'Панядзелак', 3: 'Аўторак', 4: 'Серада', 5: 'Чацвер', 6: 'Пятніца', 7: 'Субота' };

const FIELDS = [
  'laudesAnt1','laudesAnt2','laudesAnt3','laudesPs1','laudesPs2','laudesPs3',
  'sext1Ant1','sext1Ant2','sext1Ant3','sext1Ps1','sext1Ps2','sext1Ps3',
  'sext2Ant1','sext2Ant2','sext2Ant3','sext2Ps1','sext2Ps2','sext2Ps3',
  'sext3Ant1','sext3Ant2','sext3Ant3','sext3Ps1','sext3Ps2','sext3Ps3',
  'vesperAnt1','vesperAnt2','vesperAnt3','vesperPs1','vesperPs2','vesperPs3',
  'vesper1Ant1','vesper1Ant2','vesper1Ant3','vesper1Ps1','vesper1Ps2','vesper1Ps3',
];

const chunk = (arr, size = 400) => Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, (i + 1) * size));
const asNullable = (v) => (v === undefined ? null : v);
const ymdToDate = (s) => new Date(`${s}T00:00:00Z`);
const addDays = (s, d) => { const x = ymdToDate(s); x.setUTCDate(x.getUTCDate() + d); return x.toISOString().slice(0, 10); };
const fallbackDayOfWeek = (s) => { const x = ymdToDate(s).getUTCDay(); return x === 0 ? 1 : x + 1; };

function parsePsalmWeek(raw) {
  if (!raw) return null;
  const m = String(raw).toUpperCase().replace(/І/g, 'I').replace(/\s+/g, ' ').trim().match(/\b(IV|III|II|I)\b\s+ТЫДЗЕНЬ\s+ПСАЛТЫРА/i);
  if (!m) return null;
  return { I: 1, II: 2, III: 3, IV: 4 }[m[1]] ?? null;
}

function buildPayload(row, sourceByDate, dateStr, psalmWeekNumber, dayOfWeek, report) {
  const payload = {
    _title: `${psalmWeekNumber} тыдзень, ${WEEKDAY_LABELS[dayOfWeek] || dayOfWeek}, Адвэнт`,
    _checkedAt: null,
    _dayOfWeek: dayOfWeek,
    _isChecked: false,
    _periodType: 'advent',
    _psalmWeekNumber: psalmWeekNumber,
  };
  for (const f of FIELDS) payload[f] = null;

  for (const f of FIELDS.filter((x) => !x.startsWith('vesper1'))) payload[f] = asNullable(row[f]);

  if (dayOfWeek === 1) {
    const sat = sourceByDate.get(addDays(dateStr, -1));
    if (!sat) {
      report.stats.missingSaturdayForVesper1.push({ sunday: dateStr, saturdayExpected: addDays(dateStr, -1) });
    } else {
      payload.vesper1Ant1 = asNullable(sat.vesperAnt1);
      payload.vesper1Ant2 = asNullable(sat.vesperAnt2);
      payload.vesper1Ant3 = asNullable(sat.vesperAnt3);
      payload.vesper1Ps1 = asNullable(sat.vesperPs1);
      payload.vesper1Ps2 = asNullable(sat.vesperPs2);
      payload.vesper1Ps3 = asNullable(sat.vesperPs3);
    }
  }

  return payload;
}

async function main() {
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  const db = admin.firestore();

  const all = await db.collection(SOURCE_COLLECTION).where(admin.firestore.FieldPath.documentId(), '>=', '2019-11-20').where(admin.firestore.FieldPath.documentId(), '<=', '2025-12-16').orderBy(admin.firestore.FieldPath.documentId()).get();
  const sourceByDate = new Map(all.docs.map((d) => [d.id, { id: d.id, ...d.data() }]));

  const existing = await db.collection(TARGET_COLLECTION).where('_periodType', '==', 'advent').get();
  for (const c of chunk(existing.docs)) { const b = db.batch(); for (const d of c) b.delete(d.ref); await b.commit(); }

  const filled = new Map();
  const report = {
    sourceCollection: SOURCE_COLLECTION,
    deletedTemplates: existing.size,
    yearsScanned: YEARS_DESC,
    stats: { createdTemplates: 0, missingPsalmWeek: [], missingSaturdayForVesper1: [], missingTemplateSlots: [], filledFrom: {} },
  };

  for (const year of YEARS_DESC) {
    for (let d = ADVENT_STARTS[year]; d <= `${year}${SEARCH_END_SUFFIX}`; d = addDays(d, 1)) {
      const row = sourceByDate.get(d);
      if (!row || row._periodType !== 'advent') continue;
      const ps = parsePsalmWeek(row._feastName);
      if (!ps) { report.stats.missingPsalmWeek.push({ date: d, feastName: row._feastName ?? null }); continue; }
      const dow = Number(row._dayOfWeek) || fallbackDayOfWeek(d);
      const id = `advent-psalmweek-${ps}-day-${dow}`;
      if (filled.has(id)) continue;
      filled.set(id, { id, payload: buildPayload(row, sourceByDate, d, ps, dow, report) });
      report.stats.filledFrom[id] = { year, date: d };
    }
  }

  for (const c of chunk(Array.from(filled.values()))) { const b = db.batch(); for (const r of c) b.set(db.collection(TARGET_COLLECTION).doc(r.id), r.payload, { merge: false }); await b.commit(); }

  report.stats.createdTemplates = filled.size;
  for (let w = 1; w <= 4; w += 1) for (let d = 1; d <= 7; d += 1) { const id = `advent-psalmweek-${w}-day-${d}`; if (!filled.has(id)) report.stats.missingTemplateSlots.push(id); }

  await writeFile(new URL('./json/advent-day-templates-regeneration-report.json', import.meta.url), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  if (report.stats.missingTemplateSlots.length || report.stats.missingPsalmWeek.length || report.stats.missingSaturdayForVesper1.length) process.exitCode = 2;
}

main().catch((e) => { console.error(e); process.exit(1); });
