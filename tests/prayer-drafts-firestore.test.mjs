// Closed prayer drafts against the Firestore emulator (rules + publish transaction), per role.
//   npm run test:drafts   (needs JDK 21 for the emulator)
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from 'firebase/app';
import * as fs from 'firebase/firestore';
import { initializeApp as adminApp } from 'firebase-admin/app';
import { getFirestore as adminDb } from 'firebase-admin/firestore';
import { createDraftActions } from '../src/utils/prayerDraftActions.mjs';
import { createPrayerContentWriter } from '../src/utils/prayerContentWriter.mjs';

const { doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, serverTimestamp, connectFirestoreEmulator, getFirestore } = fs;
const emulator = process.env.FIRESTORE_EMULATOR_HOST;
describe('prayerDrafts: roles, publish transaction, concurrency, hiding', { skip: !emulator }, () => {
  assert.match(emulator, /^(127\.0\.0\.1|localhost):\d+$/, 'local emulator only');
  const [host, port] = emulator.split(':'); const projectId = 'demo-rules';
  const seed = adminDb(adminApp({ projectId }, 'drafts-seed'));
  const apps = [];
  const client = (uid) => {
    const app = initializeApp({ projectId, apiKey: 'demo-key' }, `drafts-${apps.length}`); apps.push(app);
    const db = getFirestore(app);
    connectFirestoreEmulator(db, host, Number(port), uid ? { mockUserToken: { sub: uid, user_id: uid } } : undefined);
    return db;
  };
  const actions = (db, uid) => createDraftActions({ db, fs, actorUid: uid, writer: createPrayerContentWriter({ db, fs }) });
  const denied = (operation) => assert.rejects(operation, { code: 'permission-denied' });
  const baseDraft = (over = {}) => ({ title: 'Новая малітва', text: 'Тэкст малітвы.', tags: ['Літанія'], sourceBook: '«Кніга»', copyrightNotices: ['© Тэст, 2024'], priestOnly: false, ...over });
  let roles;
  before(async () => {
    for (const name of ['prayers', 'priestProtectedPrayers', 'priestProtectedCategories', 'prayerCategories', 'prayerDrafts', 'priestContentControl', 'admins', 'priestDeviceGrants']) await seed.recursiveDelete(seed.collection(name));
    await seed.doc('admins/plain').set({ role: 'admin' });
    await seed.doc('admins/boss').set({ role: 'superadmin' });
    await seed.doc('admins/nofield').set({ email: 'a@b' });
    await seed.doc('admins/weird').set({ role: 'superAdmin' });
    await seed.doc('priestDeviceGrants/priest').set({ uid: 'priest', status: 'active', deviceName: 'x', client: 'Web', platform: 'x', label: '' });
    await seed.doc('priestContentControl/state').set({ version: 1, lockUid: '', updatedAt: new Date() });
    await seed.doc('prayers/existing').set({ title: 'Існуючая', text: 'Старое.', tags: ['Марыя'], textFormat: 'mybrev-markdown', createdAt: new Date(1e12) });
    await seed.doc('prayerDrafts/seeded').set({ draftId: 'seeded', title: 'Чарнавік', text: 'Закрыты тэкст', textFormat: 'mybrev-markdown', tags: [], status: 'draft', version: 1 });
    await seed.doc('prayerDrafts/seeded/audit/a1').set({ action: 'create', uid: 'x' });

    roles = { anon: client(null), user: client('someone'), priest: client('priest'), weird: client('weird'), plain: client('plain'), boss: client('boss'), nofield: client('nofield'), legacy: client('64MeSP56IWVotVFG7bu8YKeLis12') };

  });
  after(async () => { await Promise.all(apps.map((app) => deleteApp(app))); });
  it('no access without an admin role: anonymous, user, priest grant, unknown role', async () => {
      for (const who of ['anon', 'user', 'priest', 'weird']) {
        const db = roles[who];
        await denied(getDoc(doc(db, 'prayerDrafts/seeded')));
        await denied(getDocs(collection(db, 'prayerDrafts')));
        await denied(getDocs(collection(db, 'prayerDrafts/seeded/audit')));
        await denied(setDoc(doc(db, 'prayerDrafts/mine'), { ...baseDraft({ draftId: 'mine' }), textFormat: 'mybrev-markdown', status: 'draft', version: 1 }));
        await denied(updateDoc(doc(db, 'prayerDrafts/seeded'), { title: 'x', version: 2 }));
        await denied(deleteDoc(doc(db, 'prayerDrafts/seeded')));
      }
    });
  it('draft is invisible to the legacy full read of prayers and to protected readers', async () => {
      const publicRows = (await getDocs(collection(roles.anon, 'prayers'))).docs.map((d) => d.id);
      assert.deepEqual(publicRows, ['existing']);
      await denied(getDocs(collection(roles.anon, 'priestProtectedPrayers')));
      assert.ok(!JSON.stringify(publicRows).includes('seeded'));
    });
  it('admin, superadmin, legacy admin and role-less admin document read and edit drafts', async () => {
      for (const who of ['plain', 'boss', 'nofield', 'legacy']) {
        const api = actions(roles[who], who === 'legacy' ? '64MeSP56IWVotVFG7bu8YKeLis12' : who);
        assert.ok((await api.listDrafts()).some((d) => d.id === 'seeded'));
        const draft = await api.getDraft('seeded');
        await api.saveDraft('seeded', { title: `Чарнавік ${who}` }, { expectedVersion: draft.version });
        assert.equal((await api.getDraft('seeded')).title, `Чарнавік ${who}`);
        assert.ok((await api.listAudit('seeded')).some((e) => e.action === 'edit' && e.uid));
      }
    });
  it('audit log and drafts cannot be deleted; audit is append-only; unknown fields rejected', async () => {
      await denied(deleteDoc(doc(roles.boss, 'prayerDrafts/seeded')));
      await denied(updateDoc(doc(roles.boss, 'prayerDrafts/seeded/audit/a1'), { action: 'x' }));
      await denied(deleteDoc(doc(roles.boss, 'prayerDrafts/seeded/audit/a1')));
      await denied(setDoc(doc(roles.boss, 'prayerDrafts/junk'), { ...baseDraft({ draftId: 'junk' }), textFormat: 'mybrev-markdown', status: 'draft', version: 1, adminSecret: 'x' }));
      await denied(setDoc(doc(roles.boss, 'prayerDrafts/junk2'), { ...baseDraft({ draftId: 'junk2' }), textFormat: 'html', status: 'draft', version: 1 }));
      await denied(setDoc(doc(roles.boss, 'prayerDrafts/junk3'), { ...baseDraft({ draftId: 'junk3' }), textFormat: 'mybrev-markdown', status: 'published', version: 1 }));
    });
  it('a raw status=published write without the public prayer in the same commit is refused', async () => {
      const draft = await actions(roles.plain, 'plain').getDraft('seeded');
      await denied(updateDoc(doc(roles.plain, 'prayerDrafts/seeded'), { status: 'published', publishedBy: 'plain', publishedAt: serverTimestamp(), targetPrayerId: 'ghost', version: draft.version + 1 }));
      assert.equal((await actions(roles.plain, 'plain').getDraft('seeded')).status, 'draft');
    });
  it('plain admin (no superadmin, no priestAccess) publishes: one public document, draft marked, audit written', async () => {
      const api = actions(roles.plain, 'plain');
      await api.createDraft('bd_one', baseDraft({ title: 'Літанія тэставая' }));
      const result = await api.publishDraft('bd_one');
      assert.equal(result.alreadyPublished, false);
      const prayer = (await getDoc(doc(roles.anon, `prayers/${result.id}`))).data();
      assert.equal(prayer.title, 'Літанія тэставая'); assert.equal(prayer.sourceDraftId, 'bd_one'); assert.equal(prayer.priestOnly, false);
      assert.match(prayer.source, /Кніга/); assert.deepEqual(prayer.copyrightNotices, ['© Тэст, 2024']);
      const draft = await api.getDraft('bd_one');
      assert.equal(draft.status, 'published'); assert.equal(draft.publishedBy, 'plain'); assert.equal(draft.targetPrayerId, result.id);
      assert.ok((await api.listAudit('bd_one')).some((e) => e.action === 'publish' && e.targetPrayerId === result.id));
    });
  it('repeat publish is idempotent', async () => {
      const api = actions(roles.boss, 'boss');
      const first = (await api.getDraft('bd_one')).targetPrayerId;
      const again = await api.publishDraft('bd_one');
      assert.deepEqual({ id: again.id, already: again.alreadyPublished }, { id: first, already: true });
      assert.equal((await getDocs(collection(roles.anon, 'prayers'))).docs.filter((d) => d.data().sourceDraftId === 'bd_one').length, 1);
      await assert.rejects(() => actions(roles.boss, 'boss').saveDraft('bd_one', { title: 'x' }), { code: 'published' });
    });
  it('two admins publishing the same draft at once create exactly one public prayer', async () => {
      await actions(roles.plain, 'plain').createDraft('bd_race', baseDraft({ title: 'Гонка адміністратараў' }));
      const results = await Promise.allSettled([actions(roles.plain, 'plain').publishDraft('bd_race'), actions(roles.boss, 'boss').publishDraft('bd_race')]);
      assert.ok(results.every((r) => r.status === 'fulfilled'), JSON.stringify(results.map((r) => r.reason?.message)));
      const ids = new Set(results.map((r) => r.value.id)); assert.equal(ids.size, 1);
      assert.equal(results.filter((r) => !r.value.alreadyPublished).length, 1);
      assert.equal((await getDocs(collection(roles.anon, 'prayers'))).docs.filter((d) => d.data().sourceDraftId === 'bd_race').length, 1);
    });
  it('priestOnly draft lands in priestProtectedPrayers only; public readers never see it', async () => {
      const api = actions(roles.boss, 'boss');
      await api.createDraft('bd_priest', baseDraft({ title: 'Тое толькі для святароў', priestOnly: true }));
      const { id } = await api.publishDraft('bd_priest');
      assert.equal((await getDoc(doc(roles.anon, `prayers/${id}`))).exists(), false);
      assert.equal((await getDoc(doc(roles.priest, `priestProtectedPrayers/${id}`))).data().sourceDraftId, 'bd_priest');
      await denied(getDoc(doc(roles.anon, `priestProtectedPrayers/${id}`)));
    });
  it('duplicate title stops publication until replace or explicit confirmation; replace keeps ID and createdAt', async () => {
      const api = actions(roles.plain, 'plain');
      await api.createDraft('bd_dup', baseDraft({ title: 'Існуючая' }));
      await assert.rejects(() => api.publishDraft('bd_dup'), { code: 'duplicate' });
      assert.equal((await api.getDraft('bd_dup')).status, 'draft');
      const replaced = await api.publishDraft('bd_dup', { replaceId: 'existing' });
      assert.equal(replaced.id, 'existing');
      const prayer = (await getDoc(doc(roles.anon, 'prayers/existing'))).data();
      assert.equal(prayer.text, 'Тэкст малітвы.'); assert.equal(prayer.createdAt.toMillis(), 1e12); assert.equal(prayer.sourceDraftId, 'bd_dup');
      await api.createDraft('bd_dup2', baseDraft({ title: 'Існуючая' }));
      const forced = await api.publishDraft('bd_dup2', { acknowledgeDuplicates: true });
      assert.notEqual(forced.id, 'existing');
    });
  it('blocked drafts (no tag, source or rights) are not published and stay drafts', async () => {
      const api = actions(roles.plain, 'plain');
      await api.createDraft('bd_bad', baseDraft({ title: 'Без правоў', tags: [], copyrightNotices: [] }));
      await assert.rejects(() => api.publishDraft('bd_bad'), { code: 'blocked' });
      assert.equal((await api.getDraft('bd_bad')).status, 'draft');
    });
  it('a content lock aborts publication and leaves draft and public content consistent', async () => {
      const api = actions(roles.plain, 'plain');
      await api.createDraft('bd_lock', baseDraft({ title: 'Падчас блакіроўкі' }));
      await seed.doc('priestContentControl/state').update({ lockUid: 'migration' });
      await assert.rejects(() => api.publishDraft('bd_lock'));
      await seed.doc('priestContentControl/state').update({ lockUid: '' });
      assert.equal((await api.getDraft('bd_lock')).status, 'draft');
      assert.equal((await getDocs(collection(roles.anon, 'prayers'))).docs.filter((d) => d.data().sourceDraftId === 'bd_lock').length, 0);
      assert.equal((await api.publishDraft('bd_lock')).alreadyPublished, false);
    });
  it('stale version is rejected (optimistic conflict)', async () => {
      const api = actions(roles.plain, 'plain');
      await api.createDraft('bd_ver', baseDraft({ title: 'Версія' }));
      const draft = await api.getDraft('bd_ver');
      await api.saveDraft('bd_ver', { notes: 'a' }, { expectedVersion: draft.version });
      await assert.rejects(() => api.saveDraft('bd_ver', { notes: 'b' }, { expectedVersion: draft.version }), { code: 'conflict' });
      await assert.rejects(() => api.publishDraft('bd_ver', { expectedVersion: draft.version }), { code: 'conflict' });
    });
  it('archived draft cannot be published; archiving does not touch a public prayer; unarchive returns to draft', async () => {
      const api = actions(roles.plain, 'plain');
      await api.createDraft('bd_arch', baseDraft({ title: 'Архіў' }));
      await api.saveDraft('bd_arch', {}, { status: 'archived' });
      await assert.rejects(() => api.publishDraft('bd_arch'), { code: 'transition' });
      await api.saveDraft('bd_arch', {}, { status: 'draft' });
      const before = (await getDocs(collection(roles.anon, 'prayers'))).size;
      await api.saveDraft('bd_arch', {}, { status: 'archived' });
      assert.equal((await getDocs(collection(roles.anon, 'prayers'))).size, before);
    });
});
