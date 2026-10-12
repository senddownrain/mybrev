#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openFirestoreSnapshot } from './lib/firestore-snapshot.mjs';
import { discoverCatalog, normalizeUrl, extractArticle, deduplicate, hash, contextualAudit } from './lib/catholicby-yearcycle.mjs';
import { readGadzinki, buildDevotionHours } from './lib/devotion-hours.mjs';
import { DEFAULT_CATEGORIES } from '../src/constants/categories.js';
import { prayerAccessPolicy } from '../functions/lib/priest-policy.mjs';
import { PRAYER_TEXT_FORMAT, PRAYER_TEXT_FORMAT_VERSION } from '../src/utils/prayerMarkdown.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(ROOT, 'patchs/sources/catholicby-yearcycle');
const CONFIRMATION = 'import-catholicby-yearcycle';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export function parseArgs(argv) {
  const options = { snapshots: [], htmlDir: path.join(SOURCE, '.cache'), packageDir: path.join(SOURCE, 'package'),
    reportDir: path.join(ROOT, 'reports/catholicby-yearcycle'), offline: false, apply: false, confirm: '', rightsReviewed: false,
    serviceAccount: path.join(ROOT, 'patchs/serviceAccountKey.json') };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--apply') options.apply = true;
    else if (arg === '--offline') options.offline = true;
    else if (arg === '--rights-reviewed') options.rightsReviewed = true;
    else if (arg === '--help' || arg === '-h') options.help = true;
    else if (['--snapshot', '--html-dir', '--package-dir', '--report-dir', '--plan', '--confirm', '--service-account'].includes(arg)) {
      const value = argv[++i];
      if (!value || value.startsWith('--')) throw new Error(`Missing value: ${arg}`);
      if (arg === '--snapshot') options.snapshots.push(path.resolve(value));
      else if (arg === '--confirm') options.confirm = value;
      else options[({ '--html-dir': 'htmlDir', '--package-dir': 'packageDir', '--report-dir': 'reportDir', '--plan': 'plan', '--service-account': 'serviceAccount' })[arg]] = path.resolve(value);
      if (arg === '--html-dir') options.offline = true;
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}
async function loadSnapshots(directories) {
  let roots = directories;
  if (!roots.length) {
    // Check the mandated snapshot first. Then choose the newest existing
    // local descriptor per needed collection; never refresh or query Firestore.
    roots = [path.join(ROOT, 'backups/firestore-snapshot')];
    const dirs = await fs.readdir(path.join(ROOT, 'backups'), { withFileTypes: true }).catch(() => []);
    roots.push(...dirs.filter((d) => d.isDirectory() && d.name !== 'firestore-snapshot').map((d) => path.join(ROOT, 'backups', d.name)));
  }
  const snapshots = [];
  for (const directory of roots) {
    try { snapshots.push(await openFirestoreSnapshot(directory)); }
    catch (error) { if (directories.length || error.code !== 'ENOENT') throw error; }
  }
  const selected = {}, data = {};
  for (const collection of ['prayers', 'prayerCategories', 'priestProtectedPrayers', 'priestProtectedCategories', 'liturgicalTemplates', 'priestContentControl']) {
    const snapshot = snapshots.filter((s) => s.collectionPaths.includes(collection)).sort((a, b) =>
      String(b.manifest.exportedAt || b.manifest.snapshotVersion).localeCompare(String(a.manifest.exportedAt || a.manifest.snapshotVersion)))[0];
    data[collection] = snapshot ? await snapshot.collection(collection) : null;
    selected[collection] = snapshot ? { root: snapshot.root, projectId: snapshot.manifest.projectId, version: snapshot.manifest.snapshotVersion, exportedAt: snapshot.manifest.exportedAt } : null;
  }
  const projects = new Set(Object.values(selected).filter(Boolean).map((s) => s.projectId));
  if (projects.size > 1) throw new Error('Selected snapshots belong to different Firebase projects');
  return { data, selected };
}
async function getHtml(url, filename, options) {
  const file = path.join(options.htmlDir, `${filename}.html`);
  try {
    const html = await fs.readFile(file, 'utf8');
    const metadata = await fs.readFile(path.join(options.htmlDir, `${filename}.fetch.json`), 'utf8').then(JSON.parse).catch(() => ({}));
    if (metadata.status && metadata.status !== 200) return { ...metadata, error: `HTTP ${metadata.status}`, html: null };
    return { ...metadata, html, mode: 'local-html', bytes: Buffer.byteLength(html), rawHash: hash(html) };
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (options.offline) return { html: null, error: 'needs-manual-html', file };
  await fs.mkdir(options.htmlDir, { recursive: true });
  let error;
  for (let attempt = 0; attempt < 2; attempt++) {
    await sleep(500 + attempt * 1000);
    try {
      const response = await fetch(url, { signal: globalThis.AbortSignal.timeout(18000) });
      const html = await response.text();
      const metadata = { status: response.status, finalUrl: response.url, bytes: Buffer.byteLength(html), fetchedAt: new Date().toISOString(), rawHash: hash(html) };
      await fs.writeFile(file, html);
      await fs.writeFile(path.join(options.htmlDir, `${filename}.fetch.json`), JSON.stringify(metadata, null, 2));
      if (!response.ok) return { ...metadata, html: null, error: `HTTP ${response.status}` };
      return { ...metadata, html, mode: 'fetch' };
    } catch (failure) { error = failure.message; }
  }
  return { html: null, error };
}
const payload = (candidate) => ({ ...candidate, language: 'be', priestOnly: false, verified: false,
  textFormat: PRAYER_TEXT_FORMAT, textFormatVersion: PRAYER_TEXT_FORMAT_VERSION });

export async function buildImportPlan(options) {
  const manifest = JSON.parse(await fs.readFile(path.join(SOURCE, 'manifest.json'), 'utf8'));
  const { data, selected } = await loadSnapshots(options.snapshots);
  const existingPrayers = data.prayers ? [...data.prayers, ...(data.priestProtectedPrayers || [])] : null;
  const existingCategories = data.prayerCategories ? [...data.prayerCategories, ...(data.priestProtectedCategories || [])] : null;
  const index = await getHtml(manifest.indexUrl, 'index', options);
  const discovered = index.html ? discoverCatalog(index.html, manifest.indexUrl) : [];
  const missing = manifest.items.filter((item) => !discovered.some((link) => link.sourceUrl === normalizeUrl(item.sourceUrl))).map((item) => item.sourceUrl);
  const added = discovered.filter((link) => !manifest.items.some((item) => normalizeUrl(item.sourceUrl) === link.sourceUrl));
  const audit = { index: { ...index, html: undefined }, discovered, missing, added, items: [] };
  const entries = [];
  let docxAudit;
  for (const item of manifest.items) {
    const id = `catholicby-yearcycle-${new URL(item.sourceUrl).pathname.match(/(\d+)[^/]*$/)[1]}`;
    let candidate, quality, fetchInfo;
    if (item.n === 33) {
      try {
        docxAudit = await readGadzinki(options.packageDir);
        quality = { ...docxAudit, text: undefined };
        candidate = payload({ id, title: item.title, text: docxAudit.text, tags: item.requiredTags, sourceKind: 'local-docx',
          sourceUrl: item.sourceUrl, importKey: id,
          source: 'Тэкст паводле пададзенага дакумента «Гадзінкі.docx»' });
        fetchInfo = { mode: 'local-docx', note: 'Catholic.by link is catalog identity only; its text was not fetched' };
      } catch (error) { quality = { issues: [error.message] }; }
    } else {
      const fetched = await getHtml(item.sourceUrl, id.replace('catholicby-yearcycle-', ''), options);
      fetchInfo = { ...fetched, html: undefined };
      if (fetched.html) {
        try {
          const article = extractArticle(fetched.html, fetched.finalUrl || item.sourceUrl, item.type);
          quality = { ...article, text: undefined };
          candidate = payload({ id, title: item.title, text: article.text, tags: item.requiredTags,
            sourceKind: 'catholicby', sourceUrl: item.sourceUrl, importKey: id, source: `[Catholic.by](${item.sourceUrl})` });
        } catch (error) { quality = { issues: [error.message] }; }
      } else quality = { issues: [fetched.error] };
    }
    const dedup = candidate ? deduplicate(candidate, existingPrayers) : { status: 'blocked', matches: [] };
    let status = dedup.status;
    if (item.type === 'reference') status = 'skipped-reference';
    else if (quality?.issues?.length) status = quality.issues.every((issue) => ['station-sequence-needs-review', 'article-images-require-review'].includes(issue)) ? 'needs-review' : 'blocked';
    if (!index.html || missing.includes(item.sourceUrl)) { if (status === 'create') status = 'needs-review'; }
    entries.push({ n: item.n, title: item.title, sourceKind: candidate?.sourceKind || 'catholicby', sourceUrl: item.sourceUrl,
      candidate, ...dedup, status, quality });
    audit.items.push({ ...item, fetch: fetchInfo, status, quality });
  }
  const hours = await buildDevotionHours({ root: ROOT, prayers: data.prayers, templates: data.liturgicalTemplates || [] });
  for (const hour of hours) {
    const { audit: hourAudit, issues, ...document } = hour;
    const candidate = payload(document), dedup = deduplicate(candidate, existingPrayers);
    entries.push({ n: null, title: hour.title, sourceKind: hour.sourceKind, candidate, ...dedup,
      status: issues.length ? 'blocked' : dedup.status, quality: { issues, ...hourAudit } });
  }
  const contextual = existingPrayers ? contextualAudit(entries.filter((e) => e.candidate && e.status !== 'skipped-reference').map((e) => e.candidate), existingPrayers) : [];
  for (const row of contextual) {
    const entry = entries.find((e) => e.candidate?.id === row.id);
    entry.contextualMatches = row.matches;
    const overlap = row.matches.find((m) => m.candidateWords >= 50 && (m.normalizedExact || m.embedded || m.candidateCoverage >= 0.7));
    if (overlap && entry.status === 'create') {
      entry.status = 'needs-review';
      entry.quality.issues.push('contextual-content-overlap');
      entry.contextualConflict = overlap.id;
    }
  }
  const category = DEFAULT_CATEGORIES.find((c) => c.id === 'devotions');
  const existingCategory = existingCategories?.filter((c) => c.id === category.id || c.name.toLocaleLowerCase('be') === category.name.toLocaleLowerCase('be'));
  const categoryPlan = { candidate: { ...category, parentId: null, effectivePriestOnly: false },
    status: data.prayerCategories === null ? 'database-not-audited' : existingCategory.length > 1 ? 'needs-review' : existingCategory.length ? 'already-present' : 'create',
    existingIds: existingCategory?.map((c) => c.id) || [] };
  const legacyAudit = (data.prayers || []).filter((p) => /^import-(?:12-|13-|1[7-9]-|2[0-5]-)/.test(p.id)).map((p) => ({
    id: p.id, title: p.title, textLength: p.text?.length || 0,
    containsGadzinkiTitle: /Гадзінкі/iu.test(p.text || ''),
    gadzinkiMentionKind: p.id.startsWith('import-12-') && /\[Гадзінкі[^\]]*\]\(/iu.test(p.text || '') ? 'catalog-link-only' : null,
    matches: entries.filter((e) => e.matches.some((m) => m.id === p.id)).map((e) => e.n),
  }));
  const policy = prayerAccessPolicy([], [...(existingCategories || []), ...(categoryPlan.status === 'create' ? [categoryPlan.candidate] : [])]);
  for (const entry of entries) if (entry.candidate && policy.prayerRestricted(entry.candidate)) {
    entry.status = 'blocked'; entry.quality.issues = [...(entry.quality.issues || []), 'public-prayer-would-be-restricted-by-category'];
  }
  return { schemaVersion: 1, projectId: selected.prayers?.projectId || null, mode: 'dry-run', firestoreReads: 0, firestoreWrites: 0,
    analysisSource: 'local-firestore-snapshot', snapshots: selected,
    databaseAudited: Boolean(data.prayers && data.prayerCategories),
    expectedControl: data.priestContentControl?.find((d) => d.id === 'state')?.version ?? null,
    catalog: { expected: 33, discovered: discovered.length, stations: manifest.items.filter((i) => i.type === 'stations').length,
      missing, added, verified: Boolean(index.html && !missing.length && !added.length) },
    category: categoryPlan, entries, audit, legacyAudit, docxAudit: docxAudit ? { ...docxAudit, text: undefined } : null,
    counts: Object.fromEntries(['create', 'already-present', 'add-tags-only', 'add-source-only', 'needs-review', 'blocked', 'database-not-audited', 'skipped-reference'].map((status) => [status, entries.filter((e) => e.status === status).length])),
  };
}

export async function writeReports(plan, options) {
  const directory = options.reportDir;
  await fs.mkdir(path.join(directory, 'markdown'), { recursive: true });
  const write = (name, value) => fs.writeFile(path.join(directory, name), typeof value === 'string' ? value : `${JSON.stringify(value, null, 2)}\n`);
  for (const entry of plan.entries.filter((e) => e.candidate)) {
    await write(`markdown/${entry.candidate.id}.md`, `# ${entry.title}\n\n${entry.candidate.text}\n`);
  }
  await write('catalog-audit.json', plan.audit);
  const { audit: _audit, ...importPlan } = plan;
  await write('import-plan.json', importPlan);
  await write('dedup-report.md', '# Дедупликация\n\n' + plan.entries.map((e) => `- ${e.n || 'MyBrev'} ${e.title}: **${e.status}**${e.matches?.length ? '\n  ' + e.matches.map((m) => `${m.id}: ${m.reason}; exact=${m.exact}; similarity=${m.contentSimilarity.toFixed(3)}; existing=${m.oldTextLength}, candidate=${m.newTextLength} знаков`).join('\n  ') : ''}`).join('\n'));
  await write('content-quality.md', '# Качество контента\n\n' + plan.entries.map((e) => `- ${e.n || 'MyBrev'} ${e.title}: ${e.quality?.issues?.join('; ') || 'автоматические проверки пройдены'}; стации: ${e.quality?.stationNumbers?.join(', ') || '—'}; дни навэнны: ${e.quality?.novenaDays?.join(', ') || '—'}; text hash: ${e.candidate ? hash(e.candidate.text) : '—'}; вложенные ссылки: ${e.quality?.links?.map((l) => l.url).join(', ') || '—'}`).join('\n'));
  await write('manual-review.md', '# Ручная проверка\n\nПеред публичным импортом проверить разрешение/условия повторной публикации Catholic.by; ссылка на источник сама по себе не означает разрешение.\n\nСнимки не обновлялись; актуальность плана проверяется версией priestContentControl и точечными транзакционными чтениями при apply. Действующие тексты не заменяются. Изменения метаданных предлагаются в плане и не выполняются create-only apply.\n\n' + plan.entries.filter((e) => ['blocked', 'needs-review', 'database-not-audited'].includes(e.status)).map((e) => `- ${e.title}: ${e.status}; ${(e.quality?.issues || []).join('; ')}; ${e.sourceUrl || e.candidate.id}`).join('\n') + '\n\nОсобенности DOCX сохранены без исправлений:\n\n' + (plan.docxAudit?.anomalies || []).map((a) => `- ${a}`).join('\n'));
  await write('docx-gadzinki-audit.md', '# Гадзінкі: DOCX → Markdown\n\n' + `Сохранение слов и пунктуации при нормализации пробелов: ${plan.docxAudit?.faithful}. Строк: ${plan.docxAudit?.lineCount}; блоков/строф: ${plan.docxAudit?.stanzaCount}.\n\n` + (plan.docxAudit?.sections || []).map((s, i) => `${i + 1}. ${s}`).join('\n') + '\n\n' + JSON.stringify(plan.docxAudit, null, 2) + '\n\nСопоставление № 33: ' + plan.entries.find((e) => e.n === 33).status + '. Полное сравнение с найденными записями — dedup-report.md. Сборник № 12 проверен как существующий документ; ссылки на Гадзінкі не считаются текстом Гадзінак.\n');
  await write('mybrev-hours-audit.md', '# Четыре статические Гадзіны\n\nПорядок частей соответствует Laudes.vue / Vesper.vue. Benedictus / Magnificat полностью извлечены из компонентов, со славословием. Ойча наш — из локального snapshot молитв. Основной вариант каждой части — первый по существующему getLiturgicalAlternatives; остальные сохранены отдельно в приложении с указанием выбора. Текущая дата не участвует. Обычные Нешпары берутся из vesper*, не vesper1*. Псалмодия повторяет антифоны; встроенные альтернативные псалмы сохраняют свои антифоны.\n\n' + plan.entries.filter((e) => e.sourceKind === 'mybrev-office-template').map((e) => `## ${e.title}\n\n${e.status}\n\n\x60\x60\x60json\n${JSON.stringify(e.quality, null, 2)}\n\x60\x60\x60`).join('\n\n'));
  await write('summary.md', '# Подготовка импорта набажэнстваў\n\n' + `Режим: dry-run. Firestore: 0 чтений, 0 записей. Дедупликация: ${plan.databaseAudited ? 'локальный снимок молитв и категорий' : 'database-not-audited'}.\n\nКаталог: ${plan.catalog.discovered}/33, Крыжовыя шляхі: ${plan.catalog.stations}. Дополнительно четыре службы MyBrev. № 33 — одна молитва из DOCX. Категория devotions: ${plan.category.status}.\n\n` + `| № | Название | Источник | Статус |\n|---|---|---|---|\n` + plan.entries.map((e) => `| ${e.n || 'MyBrev'} | ${e.title.replaceAll('|', '\\|')} | ${e.sourceKind} | ${e.status} |`).join('\n') + '\n\nTotals: ' + JSON.stringify(plan.counts) + '\n\nApply не запускался, ничего не опубликовано. После разрешённого импорта необходим отдельный content:manifest dry-run и публикация только SAFE CONTENT PATCH.\n');
}

// Creates only new, audited candidates. Existing text and metadata patches
// require a separately reviewed migration; this entry point never replaces them.
export async function applyPlan(plan, options, dependencies) {
  if (options.confirm !== CONFIRMATION || !options.rightsReviewed) throw new Error(`Apply requires --confirm ${CONFIRMATION} --rights-reviewed after owner approval`);
  if (!plan.databaseAudited || plan.expectedControl === null || !plan.catalog.verified) throw new Error('Apply requires audited snapshots, content control version and verified catalog');
  const [{ default: admin }, account] = dependencies ? [{ default: dependencies.admin }, dependencies.account]
    : await Promise.all([import('firebase-admin'), fs.readFile(options.serviceAccount, 'utf8').then(JSON.parse)]);
  if (!plan.projectId || account.project_id !== plan.projectId) throw new Error('Service account project does not match the reviewed snapshot plan');
  const app = admin.initializeApp({ credential: admin.credential.cert(account) }, 'catholicby-yearcycle-import');
  try {
    const db = admin.firestore(app), control = db.doc('priestContentControl/state');
    db.settings?.({ preferRest: true });
    const creates = plan.entries.filter((e) => e.status === 'create').map((e) => e.candidate);
    if (creates.some((c) => !c?.text?.trim() || c.priestOnly !== false || c.verified !== false || !c.tags?.includes('Набажэнства') || c.textFormat !== PRAYER_TEXT_FORMAT)) throw new Error('Invalid candidate in reviewed plan');
    const category = plan.category.status === 'create' ? plan.category.candidate : null;
    const planHash = hash(JSON.stringify({ creates, category, expectedControl: plan.expectedControl }));
    const receipt = db.doc(`contentImportLogs/${CONFIRMATION}-${planHash.slice(0, 24)}`);
    const result = await db.runTransaction(async (tx) => {
      const previous = await tx.get(receipt);
      if (previous.exists) return { ...previous.data().result, alreadyApplied: true };
      const state = await tx.get(control);
      if (state.data()?.lockUid || state.data()?.version !== plan.expectedControl) throw new Error('Content changed since snapshot; apply refused. Obtain a current local snapshot with owner approval.');
      const checks = [];
      if (category) {
        checks.push(await tx.get(db.doc(`prayerCategories/${category.id}`)), await tx.get(db.doc(`priestProtectedCategories/${category.id}`)));
        for (const name of ['prayerCategories', 'priestProtectedCategories']) {
          const sameName = await tx.get(db.collection(name).where('name', '==', category.name).limit(1));
          if (!sameName.empty) throw new Error('Category was created after analysis; regenerate plan');
        }
      }
      for (const candidate of creates) {
        checks.push(await tx.get(db.doc(`prayers/${candidate.id}`)), await tx.get(db.doc(`priestProtectedPrayers/${candidate.id}`)));
        for (const [field, value] of [['importKey', candidate.importKey], ['sourceUrl', candidate.sourceUrl]]) {
          if (!value) continue;
          for (const name of ['prayers', 'priestProtectedPrayers']) {
            const found = await tx.get(db.collection(name).where(field, '==', value).limit(1));
            if (!found.empty) throw new Error(`Conflict for ${candidate.id}: ${field}`);
          }
        }
      }
      if (checks.some((s) => s.exists)) throw new Error('Target ID already exists; regenerate dry-run');
      const stamp = admin.firestore.FieldValue.serverTimestamp();
      if (category) { const { id, ...data } = category; tx.create(db.doc(`prayerCategories/${id}`), { ...data, createdAt: stamp, updatedAt: stamp }); }
      for (const { id, ...data } of creates) tx.create(db.doc(`prayers/${id}`), { ...data, effectivePriestOnly: false, createdAt: stamp, updatedAt: stamp });
      if (creates.length || category) tx.set(control, { version: plan.expectedControl + 1, updatedAt: stamp }, { merge: true });
      const outcome = { created: creates.map((c) => c.id), categoryCreated: category?.id || null, skipped: plan.entries.filter((e) => e.status !== 'create').map((e) => ({ title: e.title, status: e.status })) };
      tx.create(receipt, { planHash, result: outcome, appliedAt: stamp });
      return outcome;
    });
    return result;
  } finally { await app.delete(); }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return console.log('Dry-run: npm run db:import-catholicby-yearcycle [--snapshot DIR] [--html-dir DIR] [--package-dir DIR] [--offline]\nNew writes only, after explicit approval: --apply --plan reports/catholicby-yearcycle/import-plan.json --confirm import-catholicby-yearcycle --rights-reviewed\nNo automatic manifest publication or deploy.');
  // Reject unsafe invocation before fetching or touching credentials.
  if (options.apply && (options.confirm !== CONFIRMATION || !options.rightsReviewed)) throw new Error('Apply requires explicit confirmation and rights review');
  if (options.apply) {
    const plan = JSON.parse(await fs.readFile(options.plan || path.join(options.reportDir, 'import-plan.json'), 'utf8'));
    const result = await applyPlan(plan, options);
    await fs.mkdir(options.reportDir, { recursive: true });
    await fs.writeFile(path.join(options.reportDir, 'apply-result.json'), JSON.stringify(result, null, 2));
    console.log(result);
  } else {
    const plan = await buildImportPlan(options);
    await writeReports(plan, options);
    console.log(JSON.stringify({ report: options.reportDir, catalog: plan.catalog, counts: plan.counts, category: plan.category.status, firestoreReads: 0, firestoreWrites: 0 }, null, 2));
  }
}
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error); process.exitCode = 1; });
