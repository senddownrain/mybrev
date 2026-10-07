#!/usr/bin/env node
/**
 * Materialize the computed transfers as editable Year Overrides (final phase §12).
 *
 *   npm run ordo:materialize-transfers                      # dry run (default)
 *   npm run ordo:materialize-transfers -- --from 2025 --to 2035
 *   npm run ordo:materialize-transfers -- --live            # dry run against Firestore (read-only)
 *   npm run ordo:materialize-transfers -- --live --apply    # create / update the auto records
 *
 * The existing `liturgicalYearOverrides` are read from the local Firestore
 * snapshot (`--snapshot`, default `backups/firestore-snapshot`) or, with
 * `--live`, from Firestore. Without either, the bundled definitions
 * (`src/data/ordo/calendar-definitions.json`) are used.
 *
 * Safety: dry run by default; `--apply` needs `--live`; manual / confirmed
 * records are never overwritten; nothing is deleted (stale auto records are
 * only listed); a backup of the collection is written before any write.
 * The plan is written to `reports/ordo-transfer-overrides-plan.json` and the
 * summary to `docs/ordo-auto-transfers.md`. The service-account key is never
 * printed.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { openFirestoreSnapshot } from '../lib/firestore-snapshot.mjs';
import { setCalendarDefinitions } from '../../src/utils/ordo/definitions.js';
import {
  TRANSFER_CASES, TRANSFER_DIOCESES, buildTransferOverrideTargets, planTransferOverrides,
} from '../../src/utils/ordo/transferOverrides.js';
import { normalizeYearOverride, validateYearOverride } from '../../src/utils/ordo/yearOverrides.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const COLLECTION = 'liturgicalYearOverrides';

function parseArgs(argv) {
  const options = {
    from: 2025,
    to: 2035,
    apply: false,
    live: false,
    snapshot: path.join(ROOT, 'backups', 'firestore-snapshot'),
    serviceAccount: path.join(ROOT, 'patchs', 'serviceAccountKey.json'),
    output: path.join(ROOT, 'reports', 'ordo-transfer-overrides-plan.json'),
    doc: path.join(ROOT, 'docs', 'ordo-auto-transfers.md'),
    backupDir: path.join(ROOT, 'backups', 'ordo-calendar'),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = () => {
      const next = argv[++index];
      if (!next || next.startsWith('--')) throw new Error(`Missing value for ${arg}`);
      return next;
    };
    if (arg === '--apply') options.apply = true;
    else if (arg === '--live') options.live = true;
    else if (arg === '--from') options.from = Number(value());
    else if (arg === '--to') options.to = Number(value());
    else if (arg === '--snapshot') options.snapshot = path.resolve(value());
    else if (arg === '--no-snapshot') options.snapshot = null;
    else if (arg === '--service-account') options.serviceAccount = path.resolve(value());
    else if (arg === '--output') options.output = path.resolve(value());
    else if (arg === '--doc') options.doc = path.resolve(value());
    else if (arg === '--no-doc') options.doc = null;
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (!Number.isInteger(options.from) || !Number.isInteger(options.to) || options.from > options.to) {
    throw new Error('--from / --to must be years, from <= to');
  }
  if (options.apply && !options.live) throw new Error('--apply writes Firestore: add --live (the plan must be made against the live collection).');
  return options;
}

const strip = (data) => Object.fromEntries(Object.entries(data || {})
  .filter(([key]) => !['importedAt', 'createdAt', 'updatedAt'].includes(key)));

async function readSnapshot(directory) {
  if (!directory || !fs.existsSync(path.join(directory, 'manifest.json'))) return null;
  const snapshot = await openFirestoreSnapshot(directory);
  const entries = await snapshot.collectionEntries(COLLECTION);
  return entries ? entries.map(({ id, data }) => ({ id, data: strip(data) })) : null;
}

async function openFirestore(serviceAccountPath) {
  const [{ default: admin }, credentials] = await Promise.all([
    import('firebase-admin'), fs.promises.readFile(serviceAccountPath, 'utf8'),
  ]);
  const serviceAccount = JSON.parse(credentials);
  const app = admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: serviceAccount.project_id }, `ordo-transfers-${Date.now()}`);
  return { admin, app, firestore: admin.firestore(app), projectId: serviceAccount.project_id };
}

const formatDate = (iso) => (iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}` : '—');

/** docs/ordo-auto-transfers.md */
export function renderAutoTransfersDoc({ years, existingSource, targets, plan }) {
  const rows = targets.map((record) => {
    const operation = plan.operations.find((item) => item.targetId === record.id);
    return `| ${record.year} | ${record.scope === 'diocese' ? record.dioceseId : 'уся Беларусь'} | \`${record.targetCelebrationId}\` | ${formatDate(record.originalDate)} | ${formatDate(record.computedDate)} | ${record.transferCase} | ${record.status} | ${operation?.action || '—'} |`;
  });
  const byCase = Object.keys(TRANSFER_CASES).map((key) => `| ${TRANSFER_CASES[key]} | ${targets.filter((item) => item.transferCase === key).length} |`);
  const special = plan.operations.filter((item) => ['keep-manual', 'stale'].includes(item.action));
  return `# Ordo: аўтаматычныя пераносы як Year Overrides

Згенеравана \`npm run ordo:materialize-transfers\` (dry run) — не рэдагаваць уручную.

Гады: **${years[0]}–${years.at(-1)}**, дыяцэзіі: ${TRANSFER_DIOCESES.join(', ')}. Існуючыя выключэнні: ${existingSource}.

Engine вылічвае перанос (\`src/utils/ordo/transfers.js\`), вынік запісваецца ў \`liturgicalYearOverrides\`
як рэдагаваны запіс з provenance (\`source: 'auto-transfer'\`, \`status: 'needs-review'\`,
\`originalDate\`, \`computedDate\`, \`effectiveDate\`). Ручная праўка робіць \`source: 'manual'\`,
\`status: 'confirmed'\`; \`computedDate\` застаецца. Паўторны запуск нічога не дублюе, пацверджаныя
запісы не перазапісваюцца (\`src/utils/ordo/transferOverrides.js\`).

Дыяцэзіяльная ўрачыстасць пераносіцца толькі калі ранг пацверджаны календаром
(\`src/data/ordo/transfer-rank-evidence.js\`).

## Колькасць па выпадках

| Выпадак | Запісаў |
|---|---|
${byCase.join('\n')}

## План

| create | update | unchanged | keep-manual | stale |
|---|---|---|---|---|
| ${plan.counts.create} | ${plan.counts.update} | ${plan.counts.unchanged} | ${plan.counts.keepManual} | ${plan.counts.stale} |

## Запісы

| Год | Дзе | Празднаванне | Дата | Вылічана | Выпадак | Статус | Аперацыя |
|---|---|---|---|---|---|---|---|
${rows.join('\n') || '| — | | | | | | | |'}
${special.length ? `
## Пацверджаныя / састарэлыя

| Id | Аперацыя | Заўвага |
|---|---|---|
${special.map((item) => `| \`${item.id}\` | ${item.action} | ${item.note || ''} |`).join('\n')}
` : ''}`;
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const years = [];
  for (let year = options.from; year <= options.to; year += 1) years.push(year);

  let connection = null;
  let existing;
  let existingSource = 'bundled definitions';
  try {
    if (options.live) {
      if (!fs.existsSync(options.serviceAccount)) throw new Error('Service-account key not found; --live needs it.');
      connection = await openFirestore(options.serviceAccount);
      const snapshot = await connection.firestore.collection(COLLECTION).get();
      existing = snapshot.docs.map((doc) => ({ id: doc.id, data: strip(doc.data()) }));
      existingSource = `Firestore ${connection.projectId} (live, read-only until --apply)`;
    } else {
      existing = await readSnapshot(options.snapshot);
      if (existing) existingSource = `snapshot ${path.relative(ROOT, options.snapshot)}`;
    }
    if (!existing) {
      const bundled = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/ordo/calendar-definitions.json'), 'utf8'));
      existing = bundled.yearOverrides.map(({ id, ...data }) => ({ id, data }));
    }

    // The engine computes on the bundled permanent calendar; the stored
    // (non-transfer) year overrides shape the year exactly as at runtime.
    setCalendarDefinitions(null);
    const stored = existing.map(({ id, data }) => ({ id, ...data }));
    const targets = buildTransferOverrideTargets({ years, yearOverrides: stored, dataYearOverrides: false });
    const invalid = targets.map((record) => ({ id: record.id, errors: validateYearOverride(record) })).filter((item) => item.errors.length);
    if (invalid.length) throw new Error(`Invalid generated records: ${JSON.stringify(invalid)}`);
    const plan = planTransferOverrides(targets, existing, { years });

    const report = {
      generatedAt: new Date().toISOString(),
      mode: options.apply ? 'apply' : 'dry-run',
      years: { from: options.from, to: options.to },
      dioceses: TRANSFER_DIOCESES,
      existingSource,
      policy: 'create missing auto records; update computedDate/effectiveDate only while auto + needs-review; never overwrite manual/confirmed; never delete (stale records are listed)',
      summary: plan.counts,
      byCase: Object.fromEntries(Object.keys(TRANSFER_CASES).map((key) => [key, targets.filter((item) => item.transferCase === key).length])),
      operations: plan.operations,
      targets,
    };
    fs.mkdirSync(path.dirname(options.output), { recursive: true });
    fs.writeFileSync(options.output, `${JSON.stringify(report, null, 1)}\n`);
    if (options.doc) fs.writeFileSync(options.doc, renderAutoTransfersDoc({ years, existingSource, targets, plan }));
    console.log(JSON.stringify(report.summary));
    console.log(`plan: ${path.relative(ROOT, options.output)}`);

    if (!options.apply) {
      console.log('Dry run only. Nothing was written to Firestore.');
      return report;
    }

    const { firestore, admin } = connection;
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    fs.mkdirSync(options.backupDir, { recursive: true });
    const backupPath = path.join(options.backupDir, `year-overrides-${stamp}.json`);
    fs.writeFileSync(backupPath, `${JSON.stringify({ projectId: connection.projectId, takenAt: new Date().toISOString(), documents: existing }, null, 1)}\n`);
    console.log(`backup: ${path.relative(ROOT, backupPath)}`);
    const now = admin.firestore.FieldValue.serverTimestamp();
    const writes = plan.operations.filter((item) => item.action === 'create' || item.action === 'update');
    const batch = firestore.batch();
    writes.forEach((item) => {
      const { id: _id, ...data } = normalizeYearOverride(item.record);
      const ref = firestore.collection(COLLECTION).doc(item.id);
      batch.set(ref, { ...data, updatedAt: now, ...(item.action === 'create' ? { createdAt: now } : {}) }, { merge: item.action === 'update' });
    });
    if (writes.length) await batch.commit();
    const result = { written: writes.length, ids: writes.map((item) => item.id) };
    fs.writeFileSync(options.output.replace(/\.json$/, '-result.json'), `${JSON.stringify(result, null, 1)}\n`);
    console.log(JSON.stringify(result));
    return report;
  } finally {
    if (connection) await connection.app.delete();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
