#!/usr/bin/env node
/**
 * XI Ordinary Sunday, Psalter III: first-Vespers source correction.
 * The sole production target is days/ordinary-w11-d1.vesper1*.
 *
 * Commands:
 *   node scripts/liturgy/patch-xi-sunday-first-vespers.mjs --validate-only
 *   node scripts/liturgy/patch-xi-sunday-first-vespers.mjs --service-account path
 *   node scripts/liturgy/patch-xi-sunday-first-vespers.mjs --service-account path --apply
 *
 * No mass migration, no modifications of days/ordinary-w10-d7.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import admin from 'firebase-admin';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const XI_SOURCE_PATH = path.join(ROOT, 'scripts/liturgy/sources/xi-sunday-first-vespers-by.json');
export const XI_TARGET = 'ordinary-w11-d1';
export const XI_SUFFIXES = ['Hymn', 'Ant1', 'Ant2', 'Ant3', 'Ps1', 'Ps2', 'Ps3', 'R', 'AntMag', 'Inter', 'Pr'];
export const XI_FIELDS = XI_SUFFIXES.map((x) => 'vesper1' + x);
const sha = (x) => createHash('sha256').update(JSON.stringify(x)).digest('hex');

export function validateXiSundaySource(source) {
  if (source?.document !== 'days/' + XI_TARGET) throw Error('Incorrect target document');
  const fields = source.fields || {};
  if (Object.keys(fields).length !== XI_FIELDS.length || XI_FIELDS.some((key) => typeof fields[key] !== 'string' || !fields[key].trim())) {
    throw Error('Source must contain exactly eleven nonempty vesper1* fields');
  }
  const required = {
    vesper1Ps1: ['Псальм 113 (112)', 'Хвала Айцу'],
    vesper1Ps2: ['Псальм 116, 10-19 (115)', 'Хвала Айцу'],
    vesper1Ps3: ['Флп 2, 6-11', 'Хвала Айцу'],
    vesper1R: ['Гбр 13', 'Якія ж вялікія'],
    vesper1Inter: ['Пане, пакажы нам сваю любоў', '– наведай', '– імёны'],
    vesper1Pr: ['Усемагутны Божа, наша моц і надзея'],
    vesper1AntMag: ['Год А:', 'Год В:', 'Год С:', 'Убачыўшы натоўпы людзей'],
  };
  for (const [key, fragments] of Object.entries(required)) {
    for (const part of fragments) if (!fields[key].includes(part)) throw Error(key + ' missing ' + part);
  }
  if (fields.vesper1Pr.includes('Ты спаслаў на свет свайго Сына')) throw Error('Trinity collect contamination');
  for (const key of ['vesper1Ps1', 'vesper1Ps2', 'vesper1Ps3']) {
    if ((fields[key].match(/Хвала Айцу і Сыну/g) || []).length !== 1) throw Error(key + ' requires exactly one doxology');
  }
  if (/\<p\>1\.\s/.test(fields.vesper1Inter)) throw Error('Word list numbering escaped into intercessions');
  return fields;
}

export function planXiSundayPatch(current, fields) {
  if (!current || typeof current !== 'object') throw Error('Target document is absent');
  if (current._periodType && current._periodType !== 'ordinary') throw Error('Wrong liturgical period');
  if (current._periodWeekNumber != null && Number(current._periodWeekNumber) !== 11) throw Error('Wrong Ordinary Time week');
  if (current._dayOfWeek != null && Number(current._dayOfWeek) !== 1) throw Error('Expected Sunday document');
  const conflicts = XI_FIELDS.filter((key) => {
    const old = current[key];
    return typeof old === 'string' && old.trim() && old !== fields[key] || (old != null && typeof old !== 'string');
  });
  const updates = Object.fromEntries(XI_FIELDS.filter((key) => current[key] == null || (typeof current[key] === 'string' && !current[key].trim())).map((key) => [key, fields[key]]));
  return { conflicts, updates, unchanged: XI_FIELDS.length - Object.keys(updates).length, status: conflicts.length ? 'CONFLICT' : Object.keys(updates).length ? 'PATCH_NEEDED' : 'ALREADY_APPLIED' };
}

function argumentsOf(argv) {
  const options = { validateOnly: false, apply: false, serviceAccount: process.env.GOOGLE_APPLICATION_CREDENTIALS || '' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--validate-only') options.validateOnly = true;
    else if (argv[i] === '--apply') options.apply = true;
    else if (argv[i] === '--service-account') options.serviceAccount = argv[++i];
    else throw Error('Unknown argument ' + argv[i]);
  }
  return options;
}

async function main() {
  const args = argumentsOf(process.argv.slice(2));
  const source = JSON.parse(fs.readFileSync(XI_SOURCE_PATH, 'utf8'));
  const fields = validateXiSundaySource(source);
  if (args.validateOnly) {
    console.log(JSON.stringify({ verdict: 'VALID_SOURCE', document: source.document, fields: XI_FIELDS, sha256: sha(fields) }));
    return;
  }
  if (!args.serviceAccount) throw Error('Supply a service account via --service-account (or GOOGLE_APPLICATION_CREDENTIALS)');
  const credentials = JSON.parse(fs.readFileSync(args.serviceAccount, 'utf8'));
  if (credentials.project_id !== 'ibreviaryby') throw Error('Wrong project; no writes performed');
  const app = admin.initializeApp({ credential: admin.credential.cert(credentials), projectId: 'ibreviaryby' }, 'xi-sunday-' + process.pid);
  try {
    const db = admin.firestore(app);
    db.settings({ preferRest: true });
    const ref = db.collection('days').doc(XI_TARGET);
    const snapshot = await ref.get();
    if (!snapshot.exists) throw Error('Target days/' + XI_TARGET + ' does not exist');
    const before = snapshot.data();
    const plan = planXiSundayPatch(before, fields);
    console.log(JSON.stringify({ document: ref.path, mode: args.apply ? 'apply' : 'dry-run', status: plan.status, changes: Object.keys(plan.updates), conflicts: plan.conflicts, oldHash: sha(before), proposedHash: sha({ ...before, ...plan.updates }), observedAt: snapshot.updateTime.toDate().toISOString() }, null, 2));
    if (plan.conflicts.length) throw Error('Nonempty target field(s) differ; manual investigation required, no writes performed');
    if (!args.apply || !Object.keys(plan.updates).length) return;

    const backupDir = path.join(ROOT, 'backups/liturgy');
    fs.mkdirSync(backupDir, { recursive: true });
    const backupPath = path.join(backupDir, 'xi-sunday-first-vespers-' + new Date().toISOString().replace(/[:.]/g, '-') + '.json');
    fs.writeFileSync(backupPath, JSON.stringify({ document: ref.path, updateTime: snapshot.updateTime.toDate().toISOString(), original: before, sourceHash: sha(fields) }, null, 2) + '\n', { mode: 0o600 });
    console.log('Backup saved: ' + path.relative(ROOT, backupPath));

    await db.runTransaction(async (transaction) => {
      const now = await transaction.get(ref);
      if (!now.exists || now.updateTime.toMillis() !== snapshot.updateTime.toMillis()) throw Error('Source document changed since dry-run; refusing to write');
      const exactPlan = planXiSundayPatch(now.data(), fields);
      if (exactPlan.conflicts.length || sha(exactPlan.updates) !== sha(plan.updates)) throw Error('Concurrent or conflicting change, refusing to write');
      transaction.update(ref, exactPlan.updates);
    });
    const after = await ref.get();
    if (XI_FIELDS.some((key) => after.data()?.[key] !== fields[key])) throw Error('Post-write verification failed');
    const untouched = (data) => Object.fromEntries(Object.entries(data).filter(([key]) => !XI_FIELDS.includes(key)));
    if (sha(untouched(before)) !== sha(untouched(after.data()))) {
      throw Error('Unexpected change outside the eleven target fields');
    }
    console.log(JSON.stringify({ published: true, verified: true, updatedFields: Object.keys(plan.updates).length, document: ref.path, afterHash: sha(after.data()) }));
  } finally {
    await app.delete();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => { console.error('XI Sunday patch: ' + error.message); process.exitCode = 1; });
}
