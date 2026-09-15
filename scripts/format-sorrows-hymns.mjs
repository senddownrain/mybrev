#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { openFirestoreSnapshot } from './lib/firestore-snapshot.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const id = '15-09-our-lady-sorrows';
const fields = ['laudesHymn', 'vesperHymn'];

export function formatStanzaHymn(html) {
  if (typeof html !== 'string') throw new Error('Hymn must be HTML text');
  const paragraphs = [...html.matchAll(/<p>(.*?)<\/p>/gs)].map((match) => match[1]);
  if (paragraphs.length < 3 || paragraphs.map((paragraph) => `<p>${paragraph}</p>`).join('') !== html) {
    throw new Error('Unexpected hymn paragraph structure');
  }
  const stanzas = [];
  let lines = [];
  for (const paragraph of paragraphs) {
    if (/^<br\s*\/?\s*>$/.test(paragraph)) {
      if (lines.length !== 3) throw new Error('Hymn stanza is not three lines');
      stanzas.push(lines);
      lines = [];
    } else if (paragraph.includes('<')) {
      throw new Error('Unexpected markup inside a hymn line');
    } else {
      lines.push(paragraph);
    }
  }
  if (lines.length !== 3) throw new Error('Final hymn stanza is not three lines');
  stanzas.push(lines);
  return stanzas.map((stanza) => `<p>${stanza.join('<br />')}</p>`).join('\n');
}

function parseArgs(argv) {
  const options = {
    snapshot: path.join(root, 'backups', 'firestore-snapshot'),
    source: path.join(root, 'patchs', 'feasts', `${id}.json`),
    generated: path.join(root, 'patchs', 'db-feasts', `${id}.json`),
    report: path.join(root, 'reports', 'sorrows-hymns-format-report.json'),
    serviceAccount: path.join(root, 'patchs', 'serviceAccountKey.json'),
    apply: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--apply') options.apply = true;
    else if (argument === '--snapshot') options.snapshot = path.resolve(argv[++index]);
    else if (argument === '--source') options.source = path.resolve(argv[++index]);
    else if (argument === '--generated') options.generated = path.resolve(argv[++index]);
    else if (argument === '--report') options.report = path.resolve(argv[++index]);
    else if (argument === '--service-account') options.serviceAccount = path.resolve(argv[++index]);
    else throw new Error(`Unknown argument: ${argument}`);
  }
  return options;
}

async function applyPlan(target, serviceAccountPath) {
  const [{ default: admin }, serviceAccountText] = await Promise.all([
    import('firebase-admin'),
    fs.readFile(serviceAccountPath, 'utf8'),
  ]);
  const app = admin.initializeApp({ credential: admin.credential.cert(JSON.parse(serviceAccountText)) });
  try {
    const db = app.firestore();
    const ref = db.collection('days').doc(id);
    const current = await ref.get();
    if (!current.exists) throw new Error(`Missing days/${id}`);
    const before = Object.fromEntries(fields.map((field) => [field, current.get(field)]));
    const pending = fields.filter((field) => before[field] !== target[field]);
    for (const field of pending) {
      if (formatStanzaHymn(before[field]) !== target[field]) {
        throw new Error(`No writes made; days/${id}.${field} differs from the reviewed hymn`);
      }
    }
    if (!pending.length) return { writtenFields: 0, verifiedFields: fields.length };

    const backupDirectory = path.join(root, 'backups', 'firestore-migrations');
    await fs.mkdir(backupDirectory, { recursive: true });
    const backupPath = path.join(backupDirectory, `sorrows-hymns-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    await fs.writeFile(backupPath, `${JSON.stringify({
      createdAt: new Date().toISOString(), collection: 'days', id,
      fields: Object.fromEntries(pending.map((field) => [field, before[field]])),
    }, null, 2)}\n`, 'utf8');

    await db.runTransaction(async (transaction) => {
      const latest = await transaction.get(ref);
      for (const field of pending) {
        if (latest.get(field) !== before[field]) throw new Error(`Concurrent change to days/${id}.${field}`);
      }
      transaction.update(ref, Object.fromEntries(pending.map((field) => [field, target[field]])));
    });
    const after = await ref.get();
    for (const field of fields) {
      if (after.get(field) !== target[field]) throw new Error(`Post-write verification failed; backup: ${backupPath}`);
    }
    return { writtenFields: pending.length, verifiedFields: fields.length, backupPath };
  } finally {
    await app.delete();
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const snapshot = await openFirestoreSnapshot(options.snapshot);
  const document = await snapshot.document('fixedDays', id);
  if (!document?._templates?.includes('blessed-virgin-mary')) throw new Error('The local snapshot has no Marian sorrows feast');
  const [source, generated] = await Promise.all([options.source, options.generated]
    .map(async (file) => JSON.parse(await fs.readFile(file, 'utf8'))));
  if (generated._id !== id) throw new Error('Generated feast identity mismatch');
  const target = Object.fromEntries(fields.map((field) => {
    if (!source[field] || source[field] !== generated[field]) throw new Error(`Source and generated ${field} differ`);
    return [field, source[field]];
  }));
  const report = {
    mode: options.apply ? 'apply' : 'dry-run',
    analysisSource: 'local-firestore-snapshot',
    snapshotVersion: snapshot.manifest.snapshotVersion,
    id,
    hymns: fields.map((field) => ({
      field,
      stanzas: (target[field].match(/<p>/g) || []).length,
      lineBreaks: (target[field].match(/<br \/>/g) || []).length,
    })),
  };
  if (options.apply) Object.assign(report, await applyPlan(target, options.serviceAccount));
  await fs.mkdir(path.dirname(options.report), { recursive: true });
  await fs.writeFile(options.report, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
}
