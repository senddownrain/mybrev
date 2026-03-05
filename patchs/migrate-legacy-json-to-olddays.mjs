#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import admin from 'firebase-admin';
import { DAY_EDITOR_FIELDS } from '../src/constants/days.js';

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, 'src/json');
const DEFAULT_OUT = path.join(ROOT, 'patchs/json/oldDays-migration-preview.json');
const SERVICE_ACCOUNT_PATH = path.join(ROOT, 'patchs/serviceAccountKey.json');

const args = process.argv.slice(2);
const writeMode = args.includes('--write');
const outArg = args.find((a) => a.startsWith('--out='));
const outputPath = outArg ? path.resolve(outArg.slice('--out='.length)) : DEFAULT_OUT;

const WEEKDAY_MAP = new Map([
  ['нядзеля', 1],
  ['нядзелю', 1],
  ['нядз', 1],
  ['панядзелак', 2],
  ['панядзелак.', 2],
  ['пн', 2],
  ['аўторак', 3],
  ['аўтoрак', 3],
  ['аўт', 3],
  ['вторник', 3],
  ['серада', 4],
  ['ср', 4],
  ['чацвер', 5],
  ['чц', 5],
  ['пятніца', 6],
  ['пятница', 6],
  ['пт', 6],
  ['субота', 7],
  ['суббота', 7],
  ['сб', 7],
]);

function parsePhpMyAdminJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const start = raw.indexOf('[');
  if (start < 0) return [];
  return JSON.parse(raw.slice(start));
}

function normalizeText(value) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  return trimmed === '' ? null : trimmed;
}

function normalizeDateDDMM(dayId) {
  const raw = normalizeText(dayId);
  if (!raw) return null;

  const m = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return raw;
  const dd = String(Number(m[1])).padStart(2, '0');
  const mm = String(Number(m[2])).padStart(2, '0');
  return `${dd}.${mm}`;
}

function normalizeDocId(dayId) {
  const raw = normalizeText(dayId);
  if (!raw) return null;

  const m = raw.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return raw;
  const dd = String(Number(m[1])).padStart(2, '0');
  const mm = String(Number(m[2])).padStart(2, '0');
  return `${m[3]}-${mm}-${dd}`;
}

function normalizeWeekDayToNumber(dayName) {
  const source = normalizeText(dayName);
  if (!source) return null;

  const key = source.toLowerCase().replace(/ё/g, 'е');
  if (WEEKDAY_MAP.has(key)) return WEEKDAY_MAP.get(key);

  for (const [variant, day] of WEEKDAY_MAP.entries()) {
    if (key.includes(variant)) return day;
  }

  return null;
}

function normalizeBoolFromAlleluia(value) {
  const source = normalizeText(value);
  if (source === null) return false;
  return source === '1' || source.toLowerCase() === 'true';
}

function makeIndex(rows, idField) {
  const index = new Map();
  for (const row of rows) {
    const id = normalizeText(row?.[idField]);
    if (!id) continue;
    index.set(id, row);
  }
  return index;
}

function textById(index, id, textField) {
  const normalizedId = normalizeText(id);
  if (!normalizedId) return null;
  const row = index.get(normalizedId);
  return normalizeText(row?.[textField]);
}

function textTripletById(index, id, fields) {
  const normalizedId = normalizeText(id);
  if (!normalizedId) return { a: null, b: null, c: null };
  const row = index.get(normalizedId) || {};
  return {
    a: normalizeText(row[fields[0]]),
    b: normalizeText(row[fields[1]]),
    c: normalizeText(row[fields[2]]),
  };
}

function mergeComment(uspamin, svyatText) {
  const a = normalizeText(uspamin);
  const b = normalizeText(svyatText);
  if (!a && !b) return null;
  if (a && b) return `${a}\n${b}`;
  return a || b;
}


function parseRomanNumeral(input) {
  const source = normalizeText(input);
  if (!source) return null;

  const latin = source
    .toUpperCase()
    .replace(/І/g, 'I')
    .replace(/Х/g, 'X')
    .replace(/Ⅴ/g, 'V')
    .replace(/Ⅹ/g, 'X');

  if (/^\d+$/.test(latin)) {
    const n = Number.parseInt(latin, 10);
    return Number.isFinite(n) ? n : null;
  }

  if (!/^[IVXLCDM]+$/.test(latin)) return null;

  const values = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let total = 0;
  for (let i = 0; i < latin.length; i += 1) {
    const cur = values[latin[i]];
    const next = values[latin[i + 1]] || 0;
    total += cur < next ? -cur : cur;
  }
  return total > 0 ? total : null;
}

function extractPeriodInfoFromDayText(dayText) {
  const text = normalizeText(dayText);
  if (!text) return { periodType: null, periodWeekNumber: null };

  const lower = text.toLowerCase();
  let periodType = null;
  if (lower.includes('велікод')) periodType = 'easter';
  else if (lower.includes('вялікага пост')) periodType = 'lent';
  else if (lower.includes('адвэнт') || lower.includes('адвэнту') || lower.includes('адвент')) periodType = 'advent';
  else if (lower.includes('звычайн')) periodType = 'ordinary';
  else if (lower.includes('нараджэн')) periodType = 'christmas';

  const normalized = text
    .replace(/І/g, 'I')
    .replace(/Х/g, 'X')
    .replace(/VІІІ/g, 'VIII')
    .replace(/VІІ/g, 'VII')
    .replace(/VІ/g, 'VI')
    .replace(/ІV/g, 'IV')
    .replace(/ІІІ/g, 'III')
    .replace(/ІІ/g, 'II');

  const token = (normalized.match(/^\s*([0-9IVXLCDM]+)/i) || [null, null])[1];
  const periodWeekNumber = parseRomanNumeral(token);

  return { periodType, periodWeekNumber };
}

function legacyPeriodToCurrent(value) {
  const v = normalizeText(value)?.toLowerCase();
  if (!v) return null;

  const map = {
    ordinary: 'ordinary',
    advent: 'advent',
    lent: 'lent',
    easter: 'easter',
    christmas: 'christmas',
    звычайны: 'ordinary',
    адвэнт: 'advent',
    вялікіпост: 'lent',
    велікодны: 'easter',
    нараджэння: 'christmas',
  };

  const compact = v.replace(/\s+/g, '');
  if (map[compact]) return map[compact];
  for (const [k, mapped] of Object.entries(map)) {
    if (compact.includes(k)) return mapped;
  }
  return null;
}

function createEmptyDay() {
  return Object.fromEntries(DAY_EDITOR_FIELDS.map((f) => [f, null]));
}

function buildDayRecord(bridgeRow, indexes, stats) {
  const day = createEmptyDay();

  const bridgeDayId = normalizeText(bridgeRow.Bridge_DayId);
  const _date = normalizeDateDDMM(bridgeDayId);
  const docId = normalizeDocId(bridgeDayId);

  day._date = _date;
  day._dayOfWeek = normalizeWeekDayToNumber(bridgeRow.Bridge_DayName);

  const parsedFromDayText = extractPeriodInfoFromDayText(bridgeRow.Day);
  const periodTypeFromBridge = legacyPeriodToCurrent(bridgeRow.Bridge_Period);
  const weekFromBridge = normalizeText(bridgeRow.Bridge_Week) ? Number.parseInt(bridgeRow.Bridge_Week, 10) || null : null;

  day._periodType = parsedFromDayText.periodType || periodTypeFromBridge;
  day._periodWeekNumber = parsedFromDayText.periodWeekNumber || weekFromBridge;
  day._weekDay = normalizeText(bridgeRow.Bridge_DayName);
  day._weekNum = normalizeText(bridgeRow.Bridge_Week);
  day._dayName = normalizeText(bridgeRow.Day);
  day._feastName = normalizeText(bridgeRow.Svyata);
  day.allowedAlleluia = normalizeBoolFromAlleluia(bridgeRow.Alleluia);

  const svyatText = textById(indexes.Svyat, bridgeRow.Svyat, 'Svyat_Text');
  day.feastComment = mergeComment(bridgeRow.Uspamin, svyatText);

  day.invitatoriumAnt = textById(indexes.Zakl_Ant, bridgeRow.Zakl_Ant, 'Zakl_Ant_Text');
  day.invitatoriumPs1 = textById(indexes.Zakl_PS, bridgeRow.Zakl_PS, 'Zakl_PS_Text1');
  day.invitatoriumPs2 = textById(indexes.Zakl_PS, bridgeRow.Zakl_PS, 'Zakl_PS_Text2');
  day.invitatoriumPs3 = textById(indexes.Zakl_PS, bridgeRow.Zakl_PS, 'Zakl_PS_Text3');
  day.invitatoriumPs4 = textById(indexes.Zakl_PS, bridgeRow.Zakl_PS, 'Zakl_PS_Text4');
  day.invitatoriumPs5 = textById(indexes.Zakl_PS, bridgeRow.Zakl_PS, 'Zakl_PS_Text5');
  day.invitatoriumPs6 = textById(indexes.Zakl_PS, bridgeRow.Zakl_PS, 'Zakl_PS_Text6');

  day.officeOfReadingsHymn = textById(indexes.GCH_Gimn, bridgeRow.GCH_Gimn, 'GCH_Gimn_Text');
  const gchAnt = textTripletById(indexes.GCH_Ant, bridgeRow.GCH_Ant, ['GCH_Ant_Text1', 'GCH_Ant_Text2', 'GCH_Ant_Text3']);
  day.officeOfReadingsAnt1 = gchAnt.a;
  day.officeOfReadingsAnt2 = gchAnt.b;
  day.officeOfReadingsAnt3 = gchAnt.c;
  const gchPs = textTripletById(indexes.GCH_PS, bridgeRow.GCH_PS, ['GCH_PS_Text1', 'GCH_PS_Text2', 'GCH_PS_Text3']);
  day.officeOfReadingsPs1 = gchPs.a;
  day.officeOfReadingsPs2 = gchPs.b;
  day.officeOfReadingsPs3 = gchPs.c;
  day.officeOfReadingsVers = textById(indexes.GCH_Versh, bridgeRow.GCH_Versh, 'GCH_Versh_Text');
  day.officeOfReadingsR1 = textById(indexes.GCH_CH_1, bridgeRow.GCH_CH_1, 'GCH_CH_1_Text');
  day.officeOfReadingsR2 = textById(indexes.GCH_CH_2, bridgeRow.GCH_CH_2, 'GCH_CH_2_Text');
  day.officeOfReadingsTeDeum = textById(indexes.GCH_Tabe, bridgeRow.GCH_Tabe, 'GCH_Tabe_Text');
  day.officeOfReadingsPr = normalizeText(bridgeRow.GCH_Mal) === '-1'
    ? textById(indexes.UTR_Mal, bridgeRow.UTR_Mal, 'UTR_Mal_Text')
    : textById(indexes.GCH_Mal, bridgeRow.GCH_Mal, 'GCH_Mal_Text');

  day.laudesHymn = textById(indexes.UTR_Gimn, bridgeRow.UTR_Gimn, 'UTR_Gimn_Text');
  const utrAnt = textTripletById(indexes.UTR_Ant, bridgeRow.UTR_Ant, ['UTR_Ant_Text1', 'UTR_Ant_Text2', 'UTR_Ant_Text3']);
  day.laudesAnt1 = utrAnt.a;
  day.laudesAnt2 = utrAnt.b;
  day.laudesAnt3 = utrAnt.c;
  const utrPs = textTripletById(indexes.UTR_PS, bridgeRow.UTR_PS, ['UTR_PS_Text1', 'UTR_PS_Text2', 'UTR_PS_Text3']);
  day.laudesPs1 = utrPs.a;
  day.laudesPs2 = utrPs.b;
  day.laudesPs3 = utrPs.c;
  day.laudesR = textById(indexes.UTR_Chyt, bridgeRow.UTR_Chyt, 'UTR_Chyt_Text');
  day.laudesAntBen = textById(indexes.UTR_Ant_Zakh, bridgeRow.UTR_Ant_Zakh, 'UTR_Ant_Zakh_Text');
  day.laudesInter = textById(indexes.UTR_Prosby, bridgeRow.UTR_Prosby, 'UTR_Prosby_Text');
  day.laudesPr = textById(indexes.UTR_Mal, bridgeRow.UTR_Mal, 'UTR_Mal_Text');

  day.sext1Hymn = textById(indexes.MPD_Gimn_1, bridgeRow.MPD_Gimn_1, 'MPD_Gimn_1_Text');
  const sext1Ant = textTripletById(indexes.MPD_Ant_1, bridgeRow.MPD_Ant_1, ['MPD_Ant_1_Text1', 'MPD_Ant_1_Text2', 'MPD_Ant_1_Text3']);
  day.sext1Ant1 = sext1Ant.a;
  day.sext1Ant2 = sext1Ant.b;
  day.sext1Ant3 = sext1Ant.c;
  const sext1Ps = textTripletById(indexes.MPD_PS_1, bridgeRow.MPD_PS_1, ['MPD_PS_1_Text1', 'MPD_PS_1_Text2', 'MPD_PS_1_Text3']);
  day.sext1Ps1 = sext1Ps.a;
  day.sext1Ps2 = sext1Ps.b;
  day.sext1Ps3 = sext1Ps.c;
  day.sext1R = textById(indexes.MPD_Chyt_1, bridgeRow.MPD_Chyt_1, 'MPD_Chyt_1_Text');
  day.sext1Pr = normalizeText(bridgeRow.MPD_Mal_1) === '-1'
    ? textById(indexes.UTR_Mal, bridgeRow.UTR_Mal, 'UTR_Mal_Text')
    : textById(indexes.MPD_Mal_1, bridgeRow.MPD_Mal_1, 'MPD_Mal_1_Text');

  const sext2H = textById(indexes.MPD_Gimn_2, bridgeRow.MPD_Gimn_2, 'MPD_Gimn_2_Text');
  day.sext2Hymn = sext2H || day.sext1Hymn;
  const sext2AntRaw = textTripletById(indexes.MPD_Ant_2, bridgeRow.MPD_Ant_2, ['MPD_Ant_2_Text1', 'MPD_Ant_2_Text2', 'MPD_Ant_2_Text3']);
  day.sext2Ant1 = sext2AntRaw.a || day.sext1Ant1;
  day.sext2Ant2 = sext2AntRaw.b || day.sext1Ant2;
  day.sext2Ant3 = sext2AntRaw.c || day.sext1Ant3;
  const sext2Ps = textTripletById(indexes.MPD_PS_1, bridgeRow.MPD_PS_2, ['MPD_PS_1_Text1', 'MPD_PS_1_Text2', 'MPD_PS_1_Text3']);
  day.sext2Ps1 = sext2Ps.a;
  day.sext2Ps2 = sext2Ps.b;
  day.sext2Ps3 = sext2Ps.c;
  day.sext2R = textById(indexes.MPD_Chyt_2, bridgeRow.MPD_Chyt_2, 'MPD_Chyt_2_Text');
  day.sext2Pr = normalizeText(bridgeRow.MPD_Mal_2) === '-1'
    ? textById(indexes.UTR_Mal, bridgeRow.UTR_Mal, 'UTR_Mal_Text')
    : textById(indexes.MPD_Mal_2, bridgeRow.MPD_Mal_2, 'MPD_Mal_2_Text');

  const sext3H = textById(indexes.MPD_Gimn_3, bridgeRow.MPD_Gimn_3, 'MPD_Gimn_3_Text');
  day.sext3Hymn = sext3H || day.sext1Hymn;
  const sext3AntRaw = textTripletById(indexes.MPD_Ant_3, bridgeRow.MPD_Ant_3, ['MPD_Ant_3_Text1', 'MPD_Ant_3_Text2', 'MPD_Ant_3_Text3']);
  day.sext3Ant1 = sext3AntRaw.a || day.sext1Ant1;
  day.sext3Ant2 = sext3AntRaw.b || day.sext1Ant2;
  day.sext3Ant3 = sext3AntRaw.c || day.sext1Ant3;
  const sext3Ps = textTripletById(indexes.MPD_PS_1, bridgeRow.MPD_PS_3, ['MPD_PS_1_Text1', 'MPD_PS_1_Text2', 'MPD_PS_1_Text3']);
  day.sext3Ps1 = sext3Ps.a;
  day.sext3Ps2 = sext3Ps.b;
  day.sext3Ps3 = sext3Ps.c;
  day.sext3R = textById(indexes.MPD_Chyt_3, bridgeRow.MPD_Chyt_3, 'MPD_Chyt_3_Text');
  day.sext3Pr = normalizeText(bridgeRow.MPD_Mal_3) === '-1'
    ? textById(indexes.UTR_Mal, bridgeRow.UTR_Mal, 'UTR_Mal_Text')
    : textById(indexes.MPD_Mal_3, bridgeRow.MPD_Mal_3, 'MPD_Mal_3_Text');

  day.vesperHymn = textById(indexes.NESH_Gimn, bridgeRow.NESH_Gimn, 'NESH_Gimn_Text');
  const neshAnt = textTripletById(indexes.NESH_Ant, bridgeRow.NESH_Ant, ['NESH_Ant_Text1', 'NESH_Ant_Text2', 'NESH_Ant_Text3']);
  day.vesperAnt1 = neshAnt.a;
  day.vesperAnt2 = neshAnt.b;
  day.vesperAnt3 = neshAnt.c;
  const neshPs = textTripletById(indexes.NESH_PS, bridgeRow.NESH_PS, ['NESH_PS_Text1', 'NESH_PS_Text2', 'NESH_PS_Text3']);
  day.vesperPs1 = neshPs.a;
  day.vesperPs2 = neshPs.b;
  day.vesperPs3 = neshPs.c;
  day.vesperR = textById(indexes.NESH_Chyt, bridgeRow.NESH_Chyt, 'NESH_Chyt_Text');
  day.vesperAntMag = textById(indexes.NESH_Ant_M, bridgeRow.NESH_Ant_M, 'NESH_Ant_M_Text');
  day.vesperInter = textById(indexes.NESH_Prosby, bridgeRow.NESH_Prosby, 'NESH_Prosby_Text');
  day.vesperPr = normalizeText(bridgeRow.NESH_Mal) === '-1'
    ? textById(indexes.UTR_Mal, bridgeRow.UTR_Mal, 'UTR_Mal_Text')
    : textById(indexes.NESH_Mal, bridgeRow.NESH_Mal, 'NESH_Mal_Text');

  day.compHymn = textById(indexes.KAMP_Gimn, bridgeRow.KAMP_Gimn, 'KAMP_Gimn_Text');
  const kampAnt = textTripletById(indexes.KAMP_Ant, bridgeRow.KAMP_Ant, ['KAMP_Ant_Text1', 'KAMP_Ant_Text2', 'KAMP_Ant_Text2']);
  day.compAnt1 = kampAnt.a;
  day.compAnt2 = kampAnt.b;
  const kampPs = textTripletById(indexes.KAMP_PS, bridgeRow.KAMP_PS, ['KAMP_PS_Text1', 'KAMP_PS_Text2', 'KAMP_PS_Text2']);
  day.compPs1 = kampPs.a;
  day.compPs2 = kampPs.b;
  day.compR = textById(indexes.KAMP_Chyt, bridgeRow.KAMP_Chyt, 'KAMP_Chyt_Text');
  day.compResp = textById(indexes.KAMP_Resp, bridgeRow.KAMP_Resp, 'KAMP_Resp_Text');
  day.compAntS = textById(indexes.KAMP_Ant_S, bridgeRow.KAMP_Ant_S, 'KAMP_Ant_S_Text');
  day.compPr = textById(indexes.KAMP_Mal, bridgeRow.KAMP_Mal, 'KAMP_Mal_Text');
  day.compAntM = textById(indexes.KAMP_Ant_M, bridgeRow.KAMP_Ant_M, 'KAMP_Ant_M_Text');

  if (day._dayOfWeek === null) {
    stats.unresolvedDayOfWeek.push({
      bridgeDayId,
      bridgeDayName: normalizeText(bridgeRow.Bridge_DayName),
    });
  }

  const dayText = normalizeText(bridgeRow.Day);
  const looksLikePeriodWeek = dayText ? dayText.toLowerCase().includes('тыдз') : false;
  if (looksLikePeriodWeek && (day._periodType === null || day._periodWeekNumber === null)) {
    stats.unresolvedPeriod.push({
      bridgeDayId,
      bridgePeriod: normalizeText(bridgeRow.Bridge_Period),
      bridgeWeek: normalizeText(bridgeRow.Bridge_Week),
      dayText,
      resolvedPeriodType: day._periodType,
      resolvedPeriodWeekNumber: day._periodWeekNumber,
    });
  }

  return {
    id: docId,
    bridgeDayId,
    data: day,
  };
}

async function writeToFirestore(records) {
  const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));

  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }

  const db = admin.firestore();
  let batch = db.batch();
  let ops = 0;
  let written = 0;

  for (const record of records) {
    if (!record.id) continue;
    const ref = db.collection('oldDays').doc(record.id);
    batch.set(ref, record.data, { merge: true });
    ops += 1;
    written += 1;

    if (ops >= 400) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }

  if (ops > 0) await batch.commit();
  return written;
}

function main() {
  const load = (file) => parsePhpMyAdminJson(path.join(SRC_DIR, file));

  const bridgeRows = load('Bridge.json');

  const indexes = {
    Svyat: makeIndex(load('Svyat (1).json'), 'Svyat_ID'),
    Zakl_Ant: makeIndex(load('Zakl_Ant.json'), 'Zakl_Ant_ID'),
    Zakl_PS: makeIndex(load('Zakl_PS.json'), 'Zakl_PS_ID'),
    GCH_Gimn: makeIndex(load('GCH_Gimn.json'), 'GCH_Gimn_ID'),
    GCH_Ant: makeIndex(load('GCH_Ant.json'), 'GCH_Ant_ID'),
    GCH_PS: makeIndex(load('GCH_PS.json'), 'GCH_PS_ID'),
    GCH_Versh: makeIndex(load('GCH_Versh.json'), 'GCH_Versh_ID'),
    GCH_CH_1: makeIndex(load('GCH_CH_1.json'), 'GCH_CH_1_ID'),
    GCH_CH_2: makeIndex(load('GCH_CH_2.json'), 'GCH_CH_2_ID'),
    GCH_Tabe: makeIndex(load('GCH_Tabe.json'), 'GCH_Tabe_ID'),
    GCH_Mal: makeIndex(load('GCH_Mal.json'), 'GCH_Mal_ID'),
    UTR_Gimn: makeIndex(load('UTR_Gimn.json'), 'UTR_Gimn_ID'),
    UTR_Ant: makeIndex(load('UTR_Ant.json'), 'UTR_Ant_ID'),
    UTR_PS: makeIndex(load('UTR_PS.json'), 'UTR_PS_ID'),
    UTR_Chyt: makeIndex(load('UTR_Chyt.json'), 'UTR_Chyt_ID'),
    UTR_Ant_Zakh: makeIndex(load('UTR_Ant_Zakh.json'), 'UTR_Ant_Zakh_ID'),
    UTR_Prosby: makeIndex(load('UTR_Prosby.json'), 'UTR_Prosby_ID'),
    UTR_Mal: makeIndex(load('UTR_Mal.json'), 'UTR_Mal_ID'),
    MPD_Gimn_1: makeIndex(load('MPD_Gimn_1.json'), 'MPD_Gimn_1_ID'),
    MPD_Gimn_2: makeIndex(load('MPD_Gimn_2.json'), 'MPD_Gimn_2_ID'),
    MPD_Gimn_3: makeIndex(load('MPD_Gimn_3.json'), 'MPD_Gimn_3_ID'),
    MPD_Ant_1: makeIndex(load('MPD_Ant_1.json'), 'MPD_Ant_1_ID'),
    MPD_Ant_2: makeIndex(load('MPD_Ant_2.json'), 'MPD_Ant_2_ID'),
    MPD_Ant_3: makeIndex(load('MPD_Ant_3.json'), 'MPD_Ant_3_ID'),
    MPD_PS_1: makeIndex(load('MPD_PS_1.json'), 'MPD_PS_1_ID'),
    MPD_Chyt_1: makeIndex(load('MPD_Chyt_1.json'), 'MPD_Chyt_1_ID'),
    MPD_Chyt_2: makeIndex(load('MPD_Chyt_2.json'), 'MPD_Chyt_2_ID'),
    MPD_Chyt_3: makeIndex(load('MPD_Chyt_3.json'), 'MPD_Chyt_3_ID'),
    MPD_Mal_1: makeIndex(load('MPD_Mal_1.json'), 'MPD_Mal_1_ID'),
    MPD_Mal_2: makeIndex(load('MPD_Mal_2.json'), 'MPD_Mal_2_ID'),
    MPD_Mal_3: makeIndex(load('MPD_Mal_3.json'), 'MPD_Mal_3_ID'),
    NESH_Gimn: makeIndex(load('NESH_Gimn.json'), 'NESH_Gimn_ID'),
    NESH_Ant: makeIndex(load('NESH_Ant.json'), 'NESH_Ant_ID'),
    NESH_PS: makeIndex(load('NESH_PS.json'), 'NESH_PS_ID'),
    NESH_Chyt: makeIndex(load('NESH_Chyt.json'), 'NESH_Chyt_ID'),
    NESH_Ant_M: makeIndex(load('NESH_Ant_M.json'), 'NESH_Ant_M_ID'),
    NESH_Prosby: makeIndex(load('NESH_Prosby.json'), 'NESH_Prosby_ID'),
    NESH_Mal: makeIndex(load('NESH_Mal.json'), 'NESH_Mal_ID'),
    KAMP_Gimn: makeIndex(load('KAMP_Gimn.json'), 'KAMP_Gimn_ID'),
    KAMP_Ant: makeIndex(load('KAMP_Ant.json'), 'KAMP_Ant_ID'),
    KAMP_PS: makeIndex(load('KAMP_PS.json'), 'KAMP_PS_ID'),
    KAMP_Chyt: makeIndex(load('KAMP_Chyt.json'), 'KAMP_Chyt_ID'),
    KAMP_Resp: makeIndex(load('KAMP_Resp.json'), 'KAMP_Resp_ID'),
    KAMP_Ant_S: makeIndex(load('KAMP_Ant_S.json'), 'KAMP_Ant_S_ID'),
    KAMP_Mal: makeIndex(load('KAMP_Mal.json'), 'KAMP_Mal_ID'),
    KAMP_Ant_M: makeIndex(load('KAMP_Ant_M.json'), 'KAMP_Ant_M_ID'),
  };

  const stats = {
    totalBridgeRows: bridgeRows.length,
    unresolvedDayOfWeek: [],
    unresolvedPeriod: [],
  };

  const records = bridgeRows.map((row) => buildDayRecord(row, indexes, stats));

  const preview = {
    generatedAt: new Date().toISOString(),
    source: 'src/json',
    total: records.length,
    unresolvedDayOfWeek: stats.unresolvedDayOfWeek,
    unresolvedPeriod: stats.unresolvedPeriod,
    sample: records.slice(0, 10),
    records,
  };

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(preview, null, 2), 'utf8');

  return { records, stats };
}

(async () => {
  const { records, stats } = main();
  console.log(`Saved preview JSON: ${outputPath}`);
  console.log(`Prepared records: ${records.length}`);
  console.log(`Unresolved _dayOfWeek: ${stats.unresolvedDayOfWeek.length}`);
  console.log(`Unresolved _periodType/_periodWeekNumber: ${stats.unresolvedPeriod.length}`);

  if (writeMode) {
    const written = await writeToFirestore(records);
    console.log(`Firestore write done. Collection: oldDays, docs written: ${written}`);
  } else {
    console.log('Dry-run mode. Use --write to import into Firestore collection oldDays.');
  }
})().catch((error) => {
  console.error('Migration script failed:', error);
  process.exitCode = 1;
});
