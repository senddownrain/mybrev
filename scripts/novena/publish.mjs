#!/usr/bin/env node
/**
 * The admin button «Апублікаваць усе гатовыя» for a release without a browser:
 * same candidates (ready, never published), same validation against the current
 * public prayers, same documents, tracker on.
 *
 *   npm run novena:publish -- --service-account <file> --project <id>          dry-run
 *   … --apply
 *
 * Reads: the two novena collections, prayerCategories and the referenced prayers.
 */
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { publicPrayerRows } from '../../src/utils/publicPrayerCatalog.mjs';
import { NOVENA_COLLECTION, NOVENA_DRAFTS_COLLECTION, pickDefinition, publicationErrors } from '../../src/utils/novena/document.mjs';
import { bulkCandidates, publicationDocument, publishInTurn, stableJson } from '../../src/utils/novena/drafts.mjs';

const referenced = (draft) => [draft.sourcePrayerId,
  ...[...draft.template, ...draft.days.flatMap((day) => day.blocks)].map((block) => block.prayerId).filter(Boolean)];

/** Rows like the admin list builds them, from stored drafts only. */
export function publicationRows(drafts, published, prayers) {
  return [...drafts].map(([id, stored]) => {
    const problems = [...(stored.blockers || []), ...publicationErrors(pickDefinition(stored), prayers)];
    return { id, title: stored.title, stored, record: stored, published: published.get(id) || null, check: problems.length ? 'blocked' : 'ready', problems };
  });
}

/** One novena, only while the draft is still the one that was validated. */
export async function publishDraft(db, draft, loaded, { now = () => new Date() } = {}) {
  const draftRef = db.collection(NOVENA_DRAFTS_COLLECTION).doc(draft.novenaId);
  const publishedRef = db.collection(NOVENA_COLLECTION).doc(draft.novenaId);
  await db.runTransaction(async (transaction) => {
    const [stored, current] = await transaction.getAll(draftRef, publishedRef);
    const comparable = (value) => stableJson({ ...pickDefinition(value), blockers: value.blockers || [] });
    if (!stored.exists || comparable(stored.data()) !== comparable(loaded)) throw new Error('the draft changed meanwhile');
    if (current.exists) throw new Error('already published');
    const next = publicationDocument(draft, null);
    transaction.set(publishedRef, next);
    transaction.set(draftRef, {
      ...stored.data(), trackerEnabled: next.trackerEnabled, contentVersion: next.contentVersion,
      everPublished: true, updatedAt: now(), updatedBy: 'novena-publish',
    });
  });
}

async function main() {
  const argv = process.argv.slice(2);
  const value = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : null);
  const account = value('--service-account');
  const project = value('--project');
  if (!account || !project) throw new Error('Usage: publish.mjs --service-account <file> --project <id> [--apply]');
  const { default: admin } = await import('firebase-admin');
  const serviceAccount = JSON.parse(fs.readFileSync(account, 'utf8'));
  if (serviceAccount.project_id !== project) throw new Error('--project does not match the service account.');
  const app = admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: project }, 'novena-publish');
  try {
    const db = admin.firestore(app);
    db.settings({ preferRest: true });
    const [drafts, published, categories] = await Promise.all([NOVENA_DRAFTS_COLLECTION, NOVENA_COLLECTION, 'prayerCategories']
      .map((name) => db.collection(name).get()));
    const byId = (snapshot) => new Map(snapshot.docs.map((doc) => [doc.id, doc.data()]));
    const ids = [...new Set(drafts.docs.flatMap((doc) => referenced(doc.data())))];
    const found = ids.length ? await db.getAll(...ids.map((id) => db.collection('prayers').doc(id))) : [];
    const { prayers: open } = publicPrayerRows({
      prayers: found.filter((doc) => doc.exists).map((doc) => ({ ...doc.data(), id: doc.id })),
      categories: categories.docs.map((doc) => ({ ...doc.data(), id: doc.id })),
      protectedPrayers: [], protectedCategories: [],
    });
    const prayers = new Map(open.map((item) => [item.id, item]));
    const rows = publicationRows(byId(drafts), byId(published), prayers);
    const candidates = bulkCandidates(rows);
    console.log(`drafts ${drafts.size}, published ${published.size}, prayers read ${found.length}, categories ${categories.size}`);
    console.log(`to publish ${candidates.length}, blocked ${rows.filter((row) => row.check === 'blocked').length}`);
    rows.filter((row) => row.check === 'blocked').forEach((row) => console.log(`  blocked ${row.id}: ${row.problems[0]}`));
    if (!argv.includes('--apply')) { console.log('Dry-run: repeat with --apply to publish.'); return; }
    const result = await publishInTurn(candidates, (draft, loaded) => publishDraft(db, draft, loaded));
    const file = path.join('reports', 'novena', `published-${Date.now()}.json`);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify({ project, ...result }, null, 1)}\n`);
    console.log(`published ${result.published.length}, failed ${result.failed.length}, skipped ${result.skipped}; ${file}`);
    result.failed.forEach((item) => console.log(`  failed ${item.id}: ${item.message}`));
    if (result.failed.length || result.skipped) process.exitCode = 1;
  } finally {
    await app.delete();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => { console.error(error.message || error); process.exitCode = 1; });
}
