import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizePrayerSource, resolvePrayerSource, sourceForSave, formatSourceNotice, hasSourcePages, PRAYER_SOURCE_REGISTRY } from '../src/utils/prayerSource.mjs';
import { buildPrayerFromDraft } from '../src/utils/prayerDraftModel.mjs';
import { createDraftActions } from '../src/utils/prayerDraftActions.mjs';
import { createPrayerContentWriter } from '../src/utils/prayerContentWriter.mjs';
import { buildPrayerBundleCandidate } from '../scripts/prepare-prayer-source-bundle.mjs';
import { encodeCollection, describeDocuments, decodeCollection } from '../scripts/content/lib/app-content.mjs';
import { sourceToPrayer } from '../scripts/import-prayer-markdown-collection.mjs';
import { buildPrayerSourcePlan } from '../scripts/migrate-prayer-sources.mjs';
import { newDocument, replacementDocument, draftDocument } from '../scripts/prayer-import/lib/documents.mjs';
import { buildShortSourcePlan, sourceWrites, applySourcePlan, rollbackSourcePlan } from '../scripts/lib/prayer-source-plan.mjs';

const source = 'Бог добры, с. 135–136';
const stamp = '2026-11-16T00:00:00.123456789Z';
const prayer = { title: 'Малітва', text: 'Пс 23, 1–6. Ян 3, 16', tags: ['Малітва'], source, textFormat: 'mybrev-markdown', status: 'draft', version: 1 };

test('known sources are canonical, without pages, ranges, editions or legal notices; idempotent', () => {
  for (const [before, after] of [
    [source, 'Бог добры'], ['Святое Пісанне', 'Святое Пісанне'], ['Бог Добры, с. 127', 'Бог добры'], ['Малітоўнік «Бог Добры», с. 127', 'Бог добры'],
    ['«Бог Добры», ІІІ выданне (Пінск, 2022), с. 42–43. © Пінская дыяцэзія, 2022', 'Бог добры'],
    ['Літургія гадзін. Том II. Старонка 245', 'Літургія гадзін'],
    ['Літургія гадзінаў, стар. 245–246', 'Літургія гадзін'],
    ['Рымскі Імшал, стар. 42–43', 'Рымскі Імшал'],
    ['«Біблія» (Мінск, 2017), с. 10', 'Біблія (Чарняўскі)'],
    ['«Біблія» Синодальный перевод, с. 10', 'Библия. Синодальный перевод'],
    ['[Catholic.by](https://old.catholic.by/2/liturgy/pray/100105.html)', 'Catholic.by'],
  ]) {
    assert.equal(sourceForSave(before), after, before);
    assert.equal(normalizePrayerSource(after), after);
    assert.equal(hasSourcePages(after), false);
  }
  for (const item of PRAYER_SOURCE_REGISTRY) {
    assert.equal(normalizePrayerSource(item.shortTitle), item.shortTitle);
    assert.equal(hasSourcePages(item.shortTitle), false);
    assert.doesNotMatch(item.shortTitle, /©|ISBN|\d+[–-]\d+/u);
  }
});

test('every configured book importer uses a registered short source', () => {
  const config=JSON.parse(readFileSync(new URL('../scripts/prayer-import/sources.json',import.meta.url)));
  for (const {book} of Object.values(config.sources)) {
    assert.equal(resolvePrayerSource(book).status,'known',book);
    assert.equal(hasSourcePages(sourceForSave(book)),false);
    assert.doesNotMatch(sourceForSave(book),/©|\d{4}|выданне/iu);
  }
});

test('unknown and mixed sources are preserved, never guessed or mechanically truncated', () => {
  for (const input of ['Невядомая кніга, с. 127', 'Бог добры, Ойча наш', 'Бог добры (Ойча наш, 2022)', 'Бог добры — новая малітва', 'Біблія', 'https://evil.test/?source=Бог', 'https://catholic.by/x](https://catholic.by/x']) {
    assert.equal(resolvePrayerSource(input).status, 'unknown');
    assert.equal(normalizePrayerSource(input), input);
  }
  for (const input of ['Невядомая кніга, с. 127', 'Кніга, старонка 42', 'Кніга, 42–43', 'Невядомая кніга (Мінск, 2024)', 'Кніга. © Аўтар', '/sources', 'ibreviaryby.web.app/sources', 'Невядомая кніга 127']) assert.throws(() => sourceForSave(input), {code:'unknown-prayer-source'});
  assert.equal(normalizePrayerSource('  Невядомая кніга  '), '  Невядомая кніга  ');
  assert.throws(()=>sourceForSave('  Невядомая кніга  '),{code:'unknown-prayer-source'});
  assert.equal(sourceForSave(''), '');assert.equal(sourceForSave('   '), '');assert.equal(sourceForSave(null), '');
  assert.equal(formatSourceNotice({book:'Бог добры',pages:'99–100',copyrightNotices:['© A']}), 'Бог добры');
});

test('document/Markdown import and historical source extraction plan normalize before saving', () => {
  const markdown='# Малітва\n\nТэкст. Пс 23, 1–6.\n\n> Крыніца: https://catholic.by/3/lib/pray/4481-malitvy-u-roznykh-patrebakh';
  const imported=sourceToPrayer('test.md',markdown,[]);assert.equal(imported.source,'Catholic.by');assert.equal(imported.text,'Тэкст. Пс 23, 1–6.');
  const plan=buildPrayerSourcePlan([{id:'p',text:'Тэкст.\n\nКрыніца: Бог добры, с. 127'}]);
  assert.equal(plan.changes[0].updates.source,'Бог добры');
  const unknown=buildPrayerSourcePlan([{id:'p',text:'Тэкст.\n\nКрыніца: Невядомая кніга, с. 127'}]);
  assert.equal(unknown.changes.length,0);assert.equal(unknown.ambiguous.length,1);
});

test('all import document constructors and publication normalize without changing prayer text', () => {
  for (const doc of [newDocument({data:prayer}), replacementDocument({...prayer,id:'p'}, {data:prayer}), draftDocument({data:prayer}, {createdBy:'test'}), buildPrayerFromDraft({...prayer,id:'d'})]) {
    assert.equal(doc.source,'Бог добры'); assert.equal(doc.text,prayer.text);
  }
  assert.equal(draftDocument({data:{...prayer,sourceBook:source}}, {createdBy:'test'}).sourceBook,'Бог добры');
  assert.throws(()=>newDocument({data:{...prayer,source:'Невядомая, с. 1'}}));
});

function mockDb() {
  const rows = new Map(); let serial = 0;
  const snap = (ref) => ({id:ref.split('/').at(-1),exists:()=>rows.has(ref),data:()=>rows.get(ref)});
  const tx = {get:async(ref)=>snap(ref),set:(ref,data)=>rows.set(ref,data),update:(ref,data)=>rows.set(ref,{...rows.get(ref),...data}),delete:(ref)=>rows.delete(ref)};
  const fs = {
    doc: (...args) => { if (args[0] === db) return args.slice(1).join('/'); return args.join('/') + '/audit-' + (++serial); },
    collection: (...args) => args.slice(1).join('/'),
    serverTimestamp:()=>0, runTransaction:async(_db,fn)=>fn(tx),
    getDocFromServer:async(ref)=>snap(ref),
    getDocsFromServer:async(name)=>({docs:[...rows.keys()].filter((ref)=>ref.startsWith(name+'/')&&ref.split('/').length===name.split('/').length+1).map(snap)}),
  };
  const db={};return {db,fs,rows};
}

test('manual content writer and draft create/edit use the common normalizer', async () => {
  const deps = mockDb(); const writer=createPrayerContentWriter(deps);
  await writer.mutate((content)=>content.prayers.push({...prayer,id:'p'}));
  assert.equal(deps.rows.get('prayers/p').source,'Бог добры');
  const actions=createDraftActions({...deps,writer,actorUid:'admin'});
  await actions.createDraft('d',prayer);
  assert.equal(deps.rows.get('prayerDrafts/d').source,'Бог добры');
  await actions.saveDraft('d',{source:'Рымскі Імшал, стар. 42–43'},{expectedVersion:1});
  assert.equal(deps.rows.get('prayerDrafts/d').source,'Рымскі Імшал');
  await actions.saveDraft('d',{source:'Рымскі Імшал'},{expectedVersion:2});
  assert.equal(deps.rows.get('prayerDrafts/d').source,'Рымскі Імшал');
  await assert.rejects(actions.saveDraft('d',{source:'Невядомая, с. 5'},{expectedVersion:3}),{code:'unknown-prayer-source'});
  assert.equal(deps.rows.get('prayerDrafts/d').source,'Рымскі Імшал');
  assert.equal(deps.rows.get('prayerDrafts/d').text,prayer.text);
});

const plan = () => buildShortSourcePlan(new Map(['prayers','priestProtectedPrayers','prayerDrafts'].map((collection)=>[collection,[{id:'p',data:{...prayer,priestOnly:true},updateTime:stamp}]])));

test('audit covers published, ordinary and closed drafts, protected and unknown records; patch contains source fields only', () => {
  const p=plan();assert.equal(p.counts.total,3);assert.equal(p.counts.drafts,3);assert.equal(p.counts.withPages,3);
  const writes=sourceWrites(p,'ibreviaryby');
  for (const w of writes) { assert.deepEqual(w.updateMask.fieldPaths,['source']);assert.deepEqual(Object.keys(w.update.fields),['source']);assert.equal(w.currentDocument.updateTime,stamp); }
  const records=new Map([['prayers',[{id:'published',data:{...prayer,status:'published',source:'Бог добры'}},{id:'ordinary',data:prayer},{id:'unknown',data:{source:'Не вядома, с. 12'}}]],['prayerDrafts',[{id:'old',data:{...prayer,status:'archived'}}]]]);
  const audit=buildShortSourcePlan(records); assert.equal(audit.counts.published,2);assert.equal(audit.counts.drafts,2);assert.equal(audit.disputedDocuments,1);assert.equal(audit.changes.length,2);
  const conflict=buildShortSourcePlan(new Map([['prayerDrafts',[{id:'conflict',data:{source:'Бог добры, с. 1',sourceBook:'Ойча наш, с. 2'}}]]]));
  assert.equal(conflict.changes.length,0);assert.equal(conflict.disputed[0].reason,'conflicting-sources');
  const second=buildShortSourcePlan(new Map([['prayers',[{id:'p',data:{...prayer,source:'Бог добры'}}]]])); assert.equal(second.changes.length,0);
});

test('apply persists journal before writes, acknowledges each write, samples readback and stops on 429 without retry', async () => {
  const p=plan(); let commits=0,journals=0,reads=0;
  const api={saveJournal:async()=>{journals++},commit:async(writes)=>{assert.ok(journals>0);commits++;return {writeResults:writes.map(()=>({updateTime:stamp}))}},readback:async()=>{reads++;return {source:'Бог добры'}}};
  const journal=await applySourcePlan(p,api,{batchSize:2});assert.equal(journal.committed.length,3);assert.equal(commits,2);assert.equal(reads,2);
  commits=0;reads=0;
  await applySourcePlan(p,api,{journal});assert.equal(commits,0);assert.equal(reads,0);
  const rollback=rollbackSourcePlan(p,journal);assert.equal(rollback.changes[0].updates.source,source);
  const invalid=structuredClone(journal);invalid.committed[0].id='foreign';assert.throws(()=>rollbackSourcePlan(p,invalid));
  commits=0;await assert.rejects(applySourcePlan(p,{...api,commit:async()=>{commits++;throw Error('HTTP 429')}}));assert.equal(commits,1);
  const changed=structuredClone(p);changed.changes[0].updates.text='bad';assert.throws(()=>sourceWrites(changed,'ibreviaryby'));
});

test('/sources preserves complete notices and English Mass uses the canonical attribution', () => {
  const ritual=JSON.parse(readFileSync(new URL('../src/data/mass/order-of-mass.ritual.json',import.meta.url)));
  assert.equal(ritual.variants.find((v)=>v.language==='en').source,'The Roman Missal');
  assert.ok(PRAYER_SOURCE_REGISTRY.find((s)=>s.id==='roman-missal-english').notices.some((n)=>n.includes('International Commission')));
});

test('offline Flutter bundle candidate preserves all non-source data and old decoder schema', () => {
  const docs=[{...prayer,id:'known'},{...prayer,id:'unknown',source:'Невядомая, с. 2'}];
  const bundle={schemaVersion:1,collection:'prayers',contentVersion:123,...encodeCollection(docs),hashes:describeDocuments(docs).hashes};
  const {candidate,summary}=buildPrayerBundleCandidate(bundle);
  const decoded=decodeCollection(candidate);
  assert.equal(candidate.schemaVersion,1);assert.equal(candidate.contentVersion,123);assert.equal(summary.releaseReady,false);
  assert.equal(decoded.known.source,'Бог добры');assert.deepEqual(decoded.unknown,docs[1]);
  assert.deepEqual({...decoded.known,source:docs[0].source},docs[0]);
  assert.equal(buildPrayerBundleCandidate(candidate).summary.changedDocuments,0);
});
