#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openFirestoreSnapshot } from './lib/firestore-snapshot.mjs';
import { buildPrayerNormalizationPlan, checkPrayerPlan, selectPrayerNormalizationPlan, prayerPlanHash, MIGRATION_RULES } from './lib/prayer-normalization-plan.mjs';
import { applyPrayerNormalization, firestorePrayerAdapter } from './lib/prayer-normalization-apply.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function parsePrayerNormalizationArgs(argv) {
  const options = { rules: [], ids: [], apply: false, restore: false, batchSize: 10 };
  const values = { '--snapshot': 'snapshot', '--out': 'out', '--plan': 'plan', '--plan-hash': 'planHash', '--journal': 'journal', '--restore-journal': 'restoreJournal', '--service-account': 'serviceAccount', '--batch-size': 'batchSize', '--source-status': 'sourceStatus' };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--apply') options.apply = true;
    else if (argument === '--restore') options.restore = true;
    else if (argument === '--help') options.help = true;
    else if (argument === '--all-automatic') options.rules = [...MIGRATION_RULES];
    else if (argument === '--rule' || argument === '--id') {
      const value = argv[++index];
      if (!value || value.startsWith('--')) throw new Error('Missing argument value: ' + argument);
      options[argument === '--rule' ? 'rules' : 'ids'].push(value);
    } else if (values[argument]) {
      const value = argv[++index];
      if (!value || value.startsWith('--')) throw new Error('Missing argument value: ' + argument);
      options[values[argument]] = argument === '--batch-size' ? Number(value) : value;
    } else throw new Error('Unknown argument: ' + argument);
  }
  if (options.apply && options.restore) throw new Error('Choose apply or restore, not both.');
  if (options.sourceStatus && !['local-only', 'quota-blocked', 'fresh-export'].includes(options.sourceStatus)) throw new Error('Unknown source status.');
  return options;
}

async function privatePath(value) {
  const absolute = path.resolve(ROOT, value);
  const relative = path.relative(path.join(ROOT, 'backups'), absolute);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Private outputs/plans/journals must stay inside ignored backups/.');
  // A symlink/junction cannot redirect private data into public or another directory.
  let parent = absolute;
  while (parent !== path.dirname(parent)) {
    try {
      const real = await fs.realpath(parent);
      const realRelative = path.relative(path.join(ROOT, 'backups'), real);
      if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) throw new Error('Private path resolves outside backups/.');
      break;
    } catch (error) { if (error.code !== 'ENOENT') throw error; parent = path.dirname(parent); }
  }
  return absolute;
}

async function atomicJson(target, value) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = target + '.writing';
  await fs.writeFile(temporary, JSON.stringify(value, null, 2) + '\n');
  await fs.rename(temporary, target);
}

function publicSummary(plan) {
  const s = plan.stats;
  return `# Нормализация молитвенника, этап 2\n\nИсточник: локальный snapshot ${plan.snapshot.exportedAt || 'unknown'}; ${plan.coverage}\n\n${plan.snapshot.refreshFailure ? `Попытка разрешённого свежего экспорта завершилась ошибкой: ${plan.snapshot.refreshFailure}. Новый снимок не получен.\n\n` : ''}`
    + `| Показатель | Количество |\n| --- | ---: |\n| Документов | ${s.documents} |\n| Текстовых полей/языковых версий | ${s.versions} |\n| Уже канонических версий | ${s.alreadyCanonicalVersions} |\n| Уже корректных молитв | ${s.correctDocuments} |\n| Автоматические изменения: молитвы / версии | ${s.automaticDocuments} / ${s.automaticVersions} |\n| Групповая проверка: молитвы / версии / группы | ${s.assistedDocuments} / ${s.assistedVersions} / ${s.groups} |\n| Ручная проверка: молитвы / версии | ${s.manualDocuments} / ${s.manualVersions} |\n| Распознаваемые реплики до / после кода | ${s.recognizableSpeakersBefore} / ${s.recognizableSpeakersAfter} |\n\n`
    + `Категории могут пересекаться: автоматические правки не исправляют соседние неоднозначные строки. Пустые необязательные версии: ${s.optionalEmptyVersions}. Форматы: ${JSON.stringify(s.formats)}. Правила: ${JSON.stringify(s.operations)}.\n\n`
    + `Уже распознаются и не требуют визуальной правки: ${s.alreadyRenderedDocuments} молитв / ${s.alreadyRenderedVersions} версий. Это отличается от каноничности записи: часть уже читаемых двоеточий нормализуется только для единого хранения. Формы меток: ${JSON.stringify(s.roleForms)}.\n\n`
    + `В новом, ещё не опубликованном renderer восстановлено ${s.rendererRecoveredSpeakers} распознаваемых меток. Это ${s.rendererRecoveryPercent}% подтверждённых пропусков первого renderer с учётом ${s.assistedUnrenderedSpeakers} меток в склеенных репликах, оставленных для групповой проверки; показатель не оценивает неизвестные/неоднозначные роли. Firestore не изменён: 0% запланированных записей применено. Цитаты сохранены (${s.preservedQuoteBlocks} блоков), обычный курсив и повторы не считаются ошибками.\n\n`
    + `Оценка полного применения относительно локального snapshot: **${plan.publicationEstimate.verdict}**, ${plan.publicationEstimate.publicChangedDocuments} публичных документов, ${plan.publicationEstimate.bytes} байт. Это не сравнение с текущим опубликованным манифестом. Массовая публикация требует нового bundle и релиза приложения; override не разрешён.\n\n`
    + `Полный план, before/after, группы и полные тексты только в ignored backups/. SHA256 плана: ${plan.planHash}.\n\nПодлинный фрагмент «Анёл Панскі» найден в теле сборного документа локального snapshot, а не по названию документа. Его > — валидные Markdown blockquotes; они сохранены. Изменены только распознавание и предложения нормализации обёрнутых меток. Актуальный production-документ из-за квоты не прочитан.\n\nПрименение требует свежего snapshot, утверждения точного SHA256 и списка automatic-правил/ID. Assisted-группы не принимаются apply-инструментом. См. docs/prayer-normalization-stage2.md.\n`;
}

export async function runPrayerNormalization(argv = process.argv.slice(2)) {
  const options = parsePrayerNormalizationArgs(argv);
  if (options.help) {
    console.log('Dry-run: node scripts/normalize-prayer-legacy.mjs --snapshot <local-dir> --out backups/<private-run>\nSelection preview: --plan <plan.json> --rule speaker-label [--id ...]\nApply (separate owner approval): --plan <plan.json> --plan-hash <sha256> --rule <automatic-rule> --journal backups/<journal.json> --apply\nRestore (separate owner approval): --plan <plan.json> --plan-hash <sha256> --journal <apply-journal> --restore-journal <new-journal> --restore\nRules: ' + MIGRATION_RULES.join(', '));
    return;
  }
  if (options.apply || options.restore) {
    if (!options.plan || !options.planHash || !options.journal) throw new Error('Apply/restore requires a frozen plan, exact approval hash and private journal.');
    const plan = JSON.parse(await fs.readFile(await privatePath(options.plan), 'utf8'));
    checkPrayerPlan(plan, options.planHash);
    const journalPath = await privatePath(options.journal);
    const existingJournal = JSON.parse(await fs.readFile(journalPath, 'utf8').catch(error => { if (error.code === 'ENOENT') return 'null'; throw error; }));
    let documents;
    let effectiveHash;
    let state;
    let targetJournal = journalPath;
    if (options.restore) {
      if (!existingJournal || existingJournal.parentPlanHash !== plan.planHash || existingJournal.mode !== 'apply') throw new Error('Restore requires the matching apply journal.');
      if (!options.restoreJournal) throw new Error('Use a new --restore-journal path; the apply journal is preserved.');
      targetJournal = await privatePath(options.restoreJournal);
      if (existingJournal.selectionHash !== prayerPlanHash(existingJournal.selection)) throw new Error('Apply journal selection hash mismatch.');
      const approvedSelection = selectPrayerNormalizationPlan(plan, { rules: existingJournal.selectedRules, ids: existingJournal.selectedIds });
      if (prayerPlanHash(approvedSelection) !== existingJournal.selectionHash
        || prayerPlanHash({ parent: plan.planHash, rules: existingJournal.selectedRules, ids: existingJournal.selectedIds, documents: approvedSelection }) !== existingJournal.planHash) throw new Error('Apply journal does not match its approved selection.');
      if (existingJournal.inFlight?.length) throw new Error('First resume/reconcile the interrupted apply with the same plan and selection.');
      documents = existingJournal.selection.filter(document => existingJournal.completed.includes(document.id)).map(document => {
        if (!existingJournal.writtenVersions?.[document.id]) throw new Error('Apply journal does not contain verified write versions.');
        return { ...document, restoreUpdateTime: existingJournal.writtenVersions[document.id] };
      });
      effectiveHash = prayerPlanHash({ mode: 'restore', parent: plan.planHash, documents });
      state = JSON.parse(await fs.readFile(targetJournal, 'utf8').catch(error => { if (error.code === 'ENOENT') return 'null'; throw error; }));
      if (state && (state.parentPlanHash !== plan.planHash || state.mode !== 'restore')) throw new Error('Restore journal belongs to a different operation.');
    } else {
      if (plan.snapshot.refreshFailure) throw new Error('This plan was prepared while snapshot refresh was quota-blocked. Obtain a new approved snapshot and plan.');
      if (!existingJournal && (Date.now() - Date.parse(plan.snapshot.exportedAt) > 24 * 3600000 || !Number.isFinite(Date.parse(plan.snapshot.exportedAt)))) throw new Error('Snapshot is older than 24 hours or undated. Obtain a new approved snapshot and plan.');
      documents = selectPrayerNormalizationPlan(plan, options);
      if (documents.some(document => !document.snapshotUpdateTime)) throw new Error('Snapshot lacks document updateTime. Re-export with the current exporter before apply.');
      effectiveHash = prayerPlanHash({ parent: plan.planHash, rules: options.rules, ids: options.ids, documents });
      if (existingJournal && existingJournal.parentPlanHash !== plan.planHash) throw new Error('Journal belongs to a different approved plan.');
      state = existingJournal;
    }
    if (!documents.length) { console.log('No selected automatic changes to write.'); return; }
    // Import credentials/Firebase only after every local approval/selection check.
    const [{ default: admin }, text] = await Promise.all([import('firebase-admin'), fs.readFile(options.serviceAccount || path.join(ROOT, 'patchs', 'serviceAccountKey.json'), 'utf8')]);
    const credentials = JSON.parse(text);
    if (plan.snapshot.projectId !== credentials.project_id) throw new Error('Snapshot and service-account projects differ.');
    const app = admin.initializeApp({ credential: admin.credential.cert(credentials), projectId: credentials.project_id }, 'prayer-stage2-' + Date.now());
    try {
      const db = admin.firestore(app);
      db.settings({ preferRest: true });
      const result = await applyPrayerNormalization(documents, firestorePrayerAdapter(db, admin), {
        planHash: effectiveHash, batchSize: options.batchSize, journal: state, restore: options.restore,
        persist: async journal => atomicJson(targetJournal, { ...journal, parentPlanHash: plan.planHash, selection: documents,
          selectedRules: options.restore ? existingJournal.selectedRules : options.rules, selectedIds: options.restore ? existingJournal.selectedIds : options.ids }),
      });
      console.log(JSON.stringify({ mode: result.mode, documents: result.completed.length, verification: result.status, journal: targetJournal }));
    } finally { await app.delete(); }
    return;
  }
  if (options.plan) {
    const plan = JSON.parse(await fs.readFile(await privatePath(options.plan), 'utf8'));
    const documents = selectPrayerNormalizationPlan(plan, options);
    const out = await privatePath(options.out || 'backups/prayer-formatting-stage2-selection-' + Date.now());
    await atomicJson(path.join(out, 'selection.json'), { parentPlanHash: plan.planHash, rules: options.rules, ids: options.ids, documents });
    console.log(JSON.stringify({ documents: documents.length, fields: documents.reduce((sum, document) => sum + document.updates.length, 0), out }));
    return;
  }
  if (!options.snapshot) throw new Error('Specify --snapshot. No automatic live reads or refresh.');
  const snapshot = await openFirestoreSnapshot(options.snapshot);
  const entries = await snapshot.collectionEntries('prayers');
  if (!entries) throw new Error('Snapshot does not contain prayers.');
  const categories = await snapshot.collection('prayerCategories');
  if (!categories) throw new Error('Snapshot must also contain prayerCategories for access-policy publication estimates.');
  const out = await privatePath(options.out || 'backups/prayer-formatting-stage2-' + Date.now());
  if (await fs.stat(out).then(() => true, error => error.code === 'ENOENT' ? false : Promise.reject(error))) throw new Error('Output already exists; choose a new private run directory.');
  const plan = buildPrayerNormalizationPlan(entries, { categories, rules: options.rules.length ? options.rules : MIGRATION_RULES,
    snapshot: { root: snapshot.root, projectId: snapshot.manifest.projectId, version: snapshot.manifest.schemaVersion, exportedAt: snapshot.manifest.exportedAt,
      sourceStatus: options.sourceStatus || 'local-only', ...(options.sourceStatus === 'quota-blocked' ? { refreshFailure: 'Quota exceeded (code 8); authorized fresh export was refused on 2026-10-13' } : {}) } });
  await atomicJson(path.join(out, 'plan.json'), plan);
  await atomicJson(path.join(out, 'assisted-groups.json'), plan.groups);
  await fs.writeFile(path.join(ROOT, 'reports', 'prayer-format-stage2.md'), publicSummary(plan));
  console.log(JSON.stringify({ stats: plan.stats, publication: plan.publicationEstimate, planHash: plan.planHash, out }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runPrayerNormalization().catch(error => { console.error(error.message); process.exitCode = 1; });
}
