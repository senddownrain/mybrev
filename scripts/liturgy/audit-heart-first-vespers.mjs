#!/usr/bin/env node
/**
 * Read-only acceptance check for 13 June 2026 (I Vespers of XI Sunday).
 *
 *   node scripts/liturgy/audit-heart-first-vespers.mjs
 *   node scripts/liturgy/audit-heart-first-vespers.mjs --live
 *   node scripts/liturgy/audit-heart-first-vespers.mjs --live --page saved-13-june-2026.html
 *
 * Snapshot mode reads backups/firestore-snapshot; --live fetches ONLY
 * days/ordinary-w10-d7 and days/ordinary-w11-d1, without mutations.
 * A locally saved lh.catholic.by day HTML can supply the independent
 * Belarusian I Vespers reference. No text files or secrets are uploaded.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { openFirestoreSnapshot } from '../lib/firestore-snapshot.mjs';
import { extractPageFields, parseLhPage, plain } from './lib/lh-catholic-by.mjs';

export const TARGETS = Object.freeze(['ordinary-w10-d7', 'ordinary-w11-d1']);
export const VESPER_SUFFIXES = Object.freeze([
  'Hymn', 'Ant1', 'Ant2', 'Ant3', 'Ps1', 'Ps2', 'Ps3',
  'R', 'AntMag', 'Inter', 'Pr',
]);
const normalize = (value) => plain(value ?? '');
const fingerprint = (text) => text ? createHash('sha256').update(text).digest('hex').slice(0, 16) : null;

export function auditFirstVespers({ saturday, sunday, source = null }) {
  const fields = VESPER_SUFFIXES.map((suffix) => {
    const sundayProper = normalize(sunday?.['vesper1' + suffix]);
    const saturdayPsalter = normalize(saturday?.['vesper' + suffix]);
    const selected = sundayProper || saturdayPsalter;
    const selectedFrom = sundayProper ? 'sunday.vesper1' : 'saturday.vesper';
    const expected = source ? normalize(source['vesper1' + suffix]) : null;
    const status = !selected ? 'MISSING_CONTENT'
      : source === null ? 'SOURCE_NOT_PROVIDED'
      : !expected ? 'SOURCE_FIELD_NOT_EXTRACTED'
      : expected === selected ? 'MATCH' : 'DIFFERENT';
    return {
      field: 'vesper' + suffix, selectedFrom, status,
      selectedCharacters: selected.length, selectedHash: fingerprint(selected),
      ...(source !== null ? { sourceCharacters: expected.length, sourceHash: fingerprint(expected) } : {}),
    };
  });
  const counts = Object.fromEntries([...new Set(fields.map((item) => item.status))]
    .map((status) => [status, fields.filter((item) => item.status === status).length]));
  return {
    date: '2026-06-13',
    office: 'First Vespers of XI Sunday in Ordinary Time',
    readOnly: true,
    saturdayFound: Boolean(saturday),
    sundayFound: Boolean(sunday),
    fields,
    counts,
    verdict: !saturday || !sunday || fields.some((item) => ['MISSING_CONTENT', 'DIFFERENT'].includes(item.status))
      ? 'BLOCKED'
      : source === null || fields.some((item) => item.status === 'SOURCE_FIELD_NOT_EXTRACTED')
        ? 'SOURCE_VERIFICATION_REQUIRED' : 'MATCHED',
  };
}

function argsOf(argv) {
  const args = {
    live: false, snapshot: path.join(process.cwd(), 'backups', 'firestore-snapshot'),
    page: null, serviceAccount: path.join(process.cwd(), 'patchs', 'serviceAccountKey.json'),
  };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--live') args.live = true;
    else if (arg === '--snapshot') args.snapshot = argv[++index];
    else if (arg === '--page') args.page = argv[++index];
    else if (arg === '--service-account') args.serviceAccount = argv[++index];
    else throw new Error('Unknown argument: ' + arg);
  }
  return args;
}

async function loadLive(serviceAccountFile) {
  const { default: admin } = await import('firebase-admin');
  const credentials = JSON.parse(fs.readFileSync(serviceAccountFile, 'utf8'));
  const app = admin.initializeApp({ credential: admin.credential.cert(credentials) }, 'heart-vespers-readonly-' + process.pid);
  try {
    const db = app.firestore();
    const refs = TARGETS.map((id) => db.collection('days').doc(id));
    const snapshots = await db.getAll(...refs); // exactly two document reads
    return Object.fromEntries(snapshots.map((snap) => [snap.id, snap.exists ? snap.data() : null]));
  } finally {
    await app.delete();
  }
}

async function loadSnapshot(location) {
  const snapshot = await openFirestoreSnapshot(location);
  const docs = await Promise.all(TARGETS.map((id) => snapshot.document('days', id)));
  return Object.fromEntries(TARGETS.map((id, index) => [id, docs[index]]));
}

export function sourceFirstVespers(html) {
  const page = parseLhPage(html);
  const foreign = extractPageFields(page).foreign
    .find((item) => item.hour === 'vespers' && item.identity?.firstVespers);
  if (!foreign) throw new Error('The saved page has no separately identified I Vespers. Select 13 June 2026 on lh.catholic.by.');
  if (page.header?.date !== '2026-06-13') throw new Error('Source date mismatch: ' + page.header?.date);
  return { fields: foreign.fields, title: foreign.identity.title };
}

async function main() {
  const args = argsOf(process.argv.slice(2));
  const docs = args.live ? await loadLive(args.serviceAccount) : await loadSnapshot(args.snapshot);
  const reference = args.page ? sourceFirstVespers(fs.readFileSync(args.page, 'utf8')) : null;
  const result = auditFirstVespers({
    saturday: docs[TARGETS[0]], sunday: docs[TARGETS[1]], source: reference?.fields ?? null,
  });
  console.log(JSON.stringify({
    mode: args.live ? 'live-two-documents-read-only' : 'offline-snapshot',
    ...(reference ? { reference: 'lh.catholic.by, 13 June 2026', sourceHeading: reference.title } : {}),
    ...result,
  }, null, 2));
  if (result.verdict === 'BLOCKED') process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => { console.error('Read-only audit failed: ' + error.message); process.exitCode = 1; });
}
