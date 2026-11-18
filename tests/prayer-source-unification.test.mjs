import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizePrayerSource, resolvePrayerSource, sourceForSave, formatSourceNotice, hasSourcePages, PRAYER_SOURCE_REGISTRY, normalizePrayerSourceFields, sourceForEditor, EDITOR_SOURCE_MAX_LENGTH, PRAYER_SOURCE_POLICY_VERSION } from '../src/utils/prayerSource.mjs';
import { buildPrayerFromDraft, draftSourceNotice, draftSourcePatch } from '../src/utils/prayerDraftModel.mjs';
import { createDraftActions } from '../src/utils/prayerDraftActions.mjs';
import { createPrayerContentWriter } from '../src/utils/prayerContentWriter.mjs';
import { buildPrayerBundleCandidate } from '../scripts/prepare-prayer-source-bundle.mjs';
import { encodeCollection, describeDocuments, decodeCollection } from '../scripts/content/lib/app-content.mjs';
import { sourceToPrayer } from '../scripts/import-prayer-markdown-collection.mjs';
import { buildPrayerSourcePlan } from '../scripts/migrate-prayer-sources.mjs';
import { newDocument, replacementDocument, draftDocument } from '../scripts/prayer-import/lib/documents.mjs';
import {decodeSourceRestValue} from '../scripts/lib/prayer-source-rest.mjs';
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
  assert.equal(deps.rows.get('prayers/p').source,source);
  const actions=createDraftActions({...deps,writer,actorUid:'admin'});
  await actions.createDraft('d',prayer);
  assert.equal(deps.rows.get('prayerDrafts/d').source,source);
  await actions.saveDraft('d',{source:'Рымскі Імшал, стар. 42–43'},{expectedVersion:1});
  assert.equal(deps.rows.get('prayerDrafts/d').source,'Рымскі Імшал, стар. 42–43');
  await actions.saveDraft('d',{source:'Рымскі Імшал'},{expectedVersion:2});
  assert.equal(deps.rows.get('prayerDrafts/d').source,'Рымскі Імшал');
  await actions.saveDraft('d',{source:'Невядомая, с. 5'},{expectedVersion:3});
  assert.equal(deps.rows.get('prayerDrafts/d').source,'Невядомая, с. 5');
  await assert.rejects(actions.saveDraft('d',{source:'A'.repeat(501)},{expectedVersion:4}),{code:'invalid-prayer-source'});
  assert.equal(deps.rows.get('prayerDrafts/d').source,'Невядомая, с. 5');
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


test('unchanged legacy attribution allows other edits and retains original bytes', async () => {
  const raw = '  Невядомая кніга (Мінск, 1950), с. 127. © Аўтар. \n';
  const old = {...prayer, source:raw, sourceBook:'Невядомая кніга, том III'};
  const normalized = normalizePrayerSourceFields({...old,title:'Новая назва',source:raw.trim()}, {existing:old});
  assert.equal(normalized.source,raw);assert.equal(normalized.sourceBook,old.sourceBook);
  assert.throws(()=>normalizePrayerSourceFields({...old,source:'Іншая невядомая, с. 5'},{existing:old}),{code:'unknown-prayer-source'});
  assert.throws(()=>newDocument({data:old}),{code:'unknown-prayer-source'});
  assert.equal(replacementDocument(old,{data:{title:'Новая назва'}}).source,raw);
  const deps=mockDb();deps.rows.set('prayers/legacy',{...old,status:'published',effectivePriestOnly:false});
  const writer=createPrayerContentWriter(deps);
  await writer.mutate((content)=>{content.prayers[0].title='Новая назва';});
  assert.equal(deps.rows.get('prayers/legacy').source,raw);
  await writer.mutate((content)=>{content.prayers[0].priestOnly=true;});
  assert.equal(deps.rows.get('priestProtectedPrayers/legacy').source,raw);
  const actions=createDraftActions({...deps,writer,actorUid:'admin'});
  deps.rows.set('prayerDrafts/old',{...old,version:1});
  await actions.saveDraft('old',{title:'Адрэдагаваны чарнавік',source:raw.trim()},{expectedVersion:1});
  assert.equal(deps.rows.get('prayerDrafts/old').source,raw);
  assert.equal(deps.rows.get('prayerDrafts/old').sourceBook,old.sourceBook);
  assert.equal(deps.rows.get('prayerDrafts/old').title,'Адрэдагаваны чарнавік');
  await actions.saveDraft('old',{source:'Іншая невядомая, с. 5'},{expectedVersion:2});
  assert.equal(deps.rows.get('prayerDrafts/old').source,'Іншая невядомая, с. 5');
  assert.equal(deps.rows.get('prayerDrafts/old').sourceBook,old.sourceBook);
});


test('deployed policy marker and generated rules share the source registry', () => {
  const marker=JSON.parse(readFileSync(new URL('../public/prayer-source-policy.json',import.meta.url)));
  assert.equal(marker.version,PRAYER_SOURCE_POLICY_VERSION);
  const rules=readFileSync(new URL('../firestore.rules',import.meta.url),'utf8');
  const block=rules.split('// BEGIN GENERATED PRAYER SOURCE NAMES')[1].split('// END GENERATED PRAYER SOURCE NAMES')[0];
  const values=[...block.matchAll(/"([^"\n]*)"/gu)].map((m)=>m[1]);
  assert.deepEqual(values,['',...PRAYER_SOURCE_REGISTRY.map((entry)=>entry.shortTitle)]);
  assert.match(rules,/function editablePrayerSource\(value\)/);
  assert.match(rules,/value\.size\(\) <= 500/);
});


test('draft editor preserves sourceBook-only unknown attribution on unrelated edits', async () => {
  const old={...prayer,sourceBook:'  Старая невядомая кніга, т. III, с. 123  '};delete old.source;
  const deps=mockDb();deps.rows.set('prayerDrafts/book_only',old);
  const writer=createPrayerContentWriter(deps);
  const actions=createDraftActions({...deps,writer,actorUid:'admin'});
  const patch={title:'Новая назва',...draftSourcePatch(old,draftSourceNotice(old))};
  assert.equal(Object.hasOwn(patch,'source'),false);
  await actions.saveDraft('book_only',patch,{expectedVersion:1});
  const result=deps.rows.get('prayerDrafts/book_only');
  assert.equal(result.sourceBook,old.sourceBook);assert.equal(Object.hasOwn(result,'source'),false);
  assert.equal(result.title,'Новая назва');
  assert.deepEqual(draftSourcePatch(old,'Бог добры'),{source:'Бог добры'});
});


test('scoped snapshot retains timestamps for exact offline app hashes', () => {
  const data=decodeSourceRestValue({mapValue:{fields:{createdAt:{timestampValue:'2026-11-17T12:00:00.123456789Z'},source:{stringValue:'Бог добры'}}}});
  assert.deepEqual(data.createdAt,{__firestoreType:'timestamp',seconds:1794916800,nanoseconds:123456789});
  assert.equal(data.source,'Бог добры');
  assert.deepEqual(decodeSourceRestValue({timestampValue:'2026-11-17T12:00:00Z'}),{__firestoreType:'timestamp',seconds:1794916800,nanoseconds:0});
});

test('confirmed production bibliographic variants use the same registry without guessing ambiguous Agendas', () => {
  const cases=[
    ['Малітоўнік «Бог Добры», Выдавецтва Пінскай дыяцэзіі, 2022','Бог добры'],
    ['малітоўнік "Бог добры", Выдавецтва Пінскай Дыяцэзіі, 2018','Бог добры'],
    ['Малітоўнік "Ойча наш", ПРО ХРЫСТО, 202','Ойча наш'],
    ['Малітоўнік «Прасіце і атрымаеце» (Мінск, 2024), Выдавецтва «Про Хрысто»','Прасіце і атрымаеце'],
    ['«Літургічная агенда», Мінска-Магілёўская архідыяцэзія, 2010','Літургічная агенда'],
    ['Малітоўнік для мужчын «Каб пазналі Цябе…» © Гродзенская дыяцэзія Рымскакаталіцкага Касцёла ў Рэспубліцы Беларусь, 2014','Каб пазналі Цябе'],
    ['Тэкст паводле спеўніка «Божа, мы Цябе ўслаўляем» - гл. № 402','Божа, мы Цябе ўслаўляем'],
    ['для прыватнага карыстання, [https://kasciolhomiel.by/orationis-liber/litany/litaniya-da-hrysta-svyatara-i-ahvyary]','kasciolhomiel.by'],
    ['для прыватнага карыстання, \n[https://ave-maria.by/prayers/dead/2377-navenna-za-pamerlykh](https://ave-maria.by/prayers/dead/2377-navenna-za-pamerlykh)','Ave Maria'],
    ['catholic.by — «Святы ружанец»','Catholic.by'],
    ['«Парадак хросту дзяцей», Мінск 2026','Парадак хросту дзяцей'],
    ['«Парадак намашчэння хворых», Мінск 2009','Парадак намашчэння хворых'],
  ];
  for(const [before,after] of cases){assert.equal(sourceForSave(before),after);assert.equal(sourceForSave(after),after);}
  for(const unknown of [
    'Парафіяльная Агенда, Выдавецтва Пінскай дыяцэзіі, 2018',
    'Агенда. Сакрамэнталіі — частка 2, с. 214–217.',
    '«Парадак ��ак��яння», Мінск 2016',
    'для прыватнага карыстання, уласныя малітвы айцоў марыянаў',
    'для прыватнага карыстання, https://unknown.invalid/book',
    'для прыватнага карыстання, https://ave-maria.by/book https://catholic.by/other',
  ]){assert.equal(resolvePrayerSource(unknown).status,'unknown');assert.equal(normalizePrayerSource(unknown),unknown);}
});

test('Web editor accepts custom short sources while import remains strict', () => {
  assert.equal(sourceForEditor('  Уласныя малітвы айцоў марыянаў  '), 'Уласныя малітвы айцоў марыянаў');
  assert.equal(sourceForEditor('Невядомая кніга, с. 127'), 'Невядомая кніга, с. 127');
  assert.equal(sourceForEditor('Рымскі Імшал, стар. 42–43'), 'Рымскі Імшал, стар. 42–43');
  assert.equal(normalizePrayerSource(sourceForEditor('Рымскі Імшал, стар. 42–43')), 'Рымскі Імшал');
  assert.equal(sourceForEditor(''), '');
  assert.equal(EDITOR_SOURCE_MAX_LENGTH, 500);
  assert.throws(() => sourceForEditor('A'.repeat(501)), {code: 'invalid-prayer-source'});
  assert.throws(() => sourceForEditor({foo: 1}), {code: 'invalid-prayer-source'});
  assert.throws(() => sourceForSave('Невядомая кніга, с. 127'), {code: 'unknown-prayer-source'});
  const draft = {...prayer, source: 'Уласныя малітвы парафіі', tags: ['Малітва']};
  assert.equal(buildPrayerFromDraft(draft, {editorSource: true}).source, 'Уласныя малітвы парафіі');
  assert.throws(() => buildPrayerFromDraft(draft), {code: 'unknown-prayer-source'});
});

test('Web content writer saves edited sources in public and protected prayer storage', async () => {
  const deps = mockDb();
  const writer = createPrayerContentWriter(deps);
  const custom = 'Уласны зборнік малітваў';
  await writer.mutate((content) => content.prayers.push({...prayer, id: 'custom', source: custom}));
  assert.equal(deps.rows.get('prayers/custom').source, custom);
  await writer.mutate((content) => {content.prayers.find((p) => p.id === 'custom').source = 'Зборнік другой парафіі';});
  assert.equal(deps.rows.get('prayers/custom').source, 'Зборнік другой парафіі');
  await writer.mutate((content) => {content.prayers.find((p) => p.id === 'custom').priestOnly = true;});
  assert.equal(deps.rows.get('priestProtectedPrayers/custom').source, 'Зборнік другой парафіі');
  await assert.rejects(writer.mutate((content) => {
    content.prayers.find((p) => p.id === 'custom').source = 'x'.repeat(501);
  }), {code: 'invalid-prayer-source'});
  assert.equal(deps.rows.get('priestProtectedPrayers/custom').source, 'Зборнік другой парафіі');
});

test('manual known-alias source is published verbatim from draft', async () => {
  const deps = mockDb(), writer = createPrayerContentWriter(deps);
  const actions = createDraftActions({...deps, writer, actorUid:'admin'});
  const input = 'Рымскі Імшал, стар. 42–43';
  await actions.createDraft('manual_alias', {...prayer, source:input});
  assert.equal(deps.rows.get('prayerDrafts/manual_alias').source, input);
  assert.equal(draftSourceNotice(deps.rows.get('prayerDrafts/manual_alias')), input);
  assert.equal(buildPrayerFromDraft(deps.rows.get('prayerDrafts/manual_alias'), {editorSource:true}).source, input);
  assert.equal(buildPrayerFromDraft(deps.rows.get('prayerDrafts/manual_alias'), {editorSource:true}).sourceManual, true);
});
