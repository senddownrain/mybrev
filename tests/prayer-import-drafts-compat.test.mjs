// Drafts written by the import tooling (Admin SDK, bypassing rules) must be readable, editable and publishable by a
// plain admin through the real Firestore rules, and invisible to everyone else. Emulator only.
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initializeApp as initClient, deleteApp } from 'firebase/app';
import * as fs from 'firebase/firestore';
import { initializeApp as adminApp } from 'firebase-admin/app';
import { FieldValue, getFirestore as adminDb } from 'firebase-admin/firestore';
import { applyCanonPlan } from '../scripts/prayer-import/apply.mjs';
import { writeBogReports } from '../scripts/prayer-import/bog-import.mjs';
import { writeReports } from '../scripts/prayer-import/canon-import.mjs';
import { planCanonical } from '../scripts/prayer-import/lib/plan-canon.mjs';
import { planBogDobry, BOG_SOURCE_ID } from '../scripts/prayer-import/lib/plan-bog.mjs';
import { createDraftActions } from '../src/utils/prayerDraftActions.mjs';
import { createPrayerContentWriter } from '../src/utils/prayerContentWriter.mjs';
import { corpusOf, litanyEntry, SOURCES } from './helpers/prayer-import-fixture.mjs';
import { readFileSync } from 'node:fs';

const emulator = process.env.FIRESTORE_EMULATOR_HOST;
const SOURCES_JSON = JSON.parse(readFileSync(new URL('../scripts/prayer-import/sources.json', import.meta.url), 'utf8'));
describe('imported drafts vs Firestore rules (emulator)', { skip: !emulator }, () => {
  const [host, port] = (emulator || '127.0.0.1:8080').split(':');
  const admin = adminDb(adminApp({ projectId: 'demo-rules' }, 'import-compat'));
  const apps = []; let dir; let ids;
  const client = (uid) => {
    const app = initClient({ projectId: 'demo-rules', apiKey: 'k' }, `compat-${apps.length}`); apps.push(app);
    const db = fs.getFirestore(app); fs.connectFirestoreEmulator(db, host, Number(port), uid ? { mockUserToken: { sub: uid, user_id: uid } } : undefined);
    return db;
  };
  before(async () => {
    for (const name of ['prayers', 'priestProtectedPrayers', 'prayerDrafts', 'priestContentControl', 'admins', 'priestDeviceGrants']) await admin.recursiveDelete(admin.collection(name));
    await admin.doc('admins/plain').set({ role: 'admin' });
    await admin.doc('priestContentControl/state').set({ version: 1, lockUid: '', updatedAt: new Date() });
    await admin.doc('priestDeviceGrants/priest').set({ uid: 'priest', status: 'active' });
    dir = mkdtempSync(path.join(os.tmpdir(), 'compat-'));
    // pass 1: a rite excerpt -> closed REVIEW draft; pass 2: a unique Bog prayer -> draft
    const canonical = planCanonical({ corpus: corpusOf([litanyEntry('rite-1', 'Парадак пакаяння', { sourceId: 'rite_penance', kind: 'ritual', status: 'partial' })]), sources: SOURCES, oldPrayers: [], categories: [] });
    const canonSha = writeReports(path.join(dir, 'canon'), canonical, { generatedAt: 't', snapshot: [] });
    const entry = { id: 'bog-1', sourceId: BOG_SOURCE_ID, type: 'prayer', title: 'Малітва аб урадлівасці', printedHeading: 'x', language: 'be', status: 'complete', sectionTrail: ['МАЛІТОЎНІК'], pdfPageStart: 40, pdfPageEnd: 40, printedPageStart: 40, printedPageEnd: 40, uncertainties: [], blocks: [{ type: 'paragraph', text: 'Божа, дабраславі нашы палі і ўсе пасевы, дай нам дажджу ў час.', runs: [{ text: 'Божа, дабраславі нашы палі і ўсе пасевы, дай нам дажджу ў час.', color: '#231f20' }] }] };
    const bog = planBogDobry({ corpus: { index: [{ ...entry, blocks: undefined }], readEntry: () => entry }, sources: SOURCES_JSON, canonical, oldPrayers: [], categories: [], sourceSha256: 'a'.repeat(64) });
    const bogSha = writeBogReports(path.join(dir, 'bog'), bog, { generatedAt: 't', snapshot: [] });
    const run = (sub, sha) => applyCanonPlan({ db: admin, FieldValue, planDir: path.join(dir, sub), approvedSha: sha, backupDir: path.join(dir, `b-${sub}`), log: () => {} });
    await run('canon', canonSha); await run('bog', bogSha);
    ids = { rite: canonical.operations[0].targetId, bog: bog.operations[0].targetId };
  });
  after(async () => { await Promise.all(apps.map((app) => deleteApp(app))); });

  it('everyone without an admin role is refused', async () => {
    for (const who of [null, 'someone', 'priest']) {
      await assert.rejects(fs.getDocs(fs.collection(client(who), 'prayerDrafts')), { code: 'permission-denied' });
      await assert.rejects(fs.getDoc(fs.doc(client(who), `prayerDrafts/${ids.bog}`)), { code: 'permission-denied' });
    }
  });
  it('a plain admin lists, edits and directly publishes an imported draft', async () => {
    const db = client('plain');
    const api = createDraftActions({ db, fs, actorUid: 'plain', writer: createPrayerContentWriter({ db, fs }) });
    const drafts = await api.listDrafts();
    assert.deepEqual(drafts.map((d) => d.id).sort(), [ids.bog, ids.rite].sort());
    const bog = drafts.find((d) => d.id === ids.bog);
    assert.equal(bog.status, 'draft'); assert.equal(bog.origin, 'bog_dobry'); assert.equal(bog.rightsStatus, undefined);
    await api.saveDraft(ids.bog, { tags: ['У розных патрэбах'], notes: 'правяраў рэдактар' }, { expectedVersion: bog.version });
    const published = await api.publishDraft(ids.bog);
    const prayer = (await fs.getDoc(fs.doc(client(null), `prayers/${published.id}`))).data();
    assert.equal(prayer.title, 'Малітва аб урадлівасці'); assert.match(prayer.source, /Бог Добры/); assert.equal(prayer.sourceDraftId, ids.bog);
    assert.ok(!JSON.stringify(prayer).includes('aaaaaaaa')); // no PDF hash in the public document
    const rite = await api.getDraft(ids.rite);
    assert.equal(rite.reason, 'rite_scope'); assert.equal(rite.status, 'draft');
    assert.equal((await fs.getDocs(fs.collection(client(null), 'prayers'))).size, 1); // the rite draft is still closed
  });
});
