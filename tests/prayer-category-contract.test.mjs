import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { directCategoryPrayers, prayerCategoryMatch, validateCategoryChange, removeCategoryFromContent, MAX_CATEGORY_DEPTH } from '../src/utils/prayerCategoryMembership.mjs';
import { buildCategoryTree, flattenCategoryTree } from '../src/utils/prayerCategoryTree.mjs';
import { buildPrayerCategoryMenu } from '../src/utils/prayerCategoryMenu.js';
import { prayerAccessPolicy, permittedPrayerContent } from '../src/utils/priestPolicy.mjs';
import { prayerStoragePlan, canonicalPrayerContent, MAX_ATOMIC_CONTENT_WRITES } from '../src/utils/prayerStoragePlan.mjs';
import { buildPrayerTagRemovalPlan } from '../src/utils/prayerCategoryAdmin.js';
import { writeBundle } from '../scripts/content/build-app-bundle.mjs';
import { decodeCollection, encodeCollection } from '../scripts/content/lib/app-content.mjs';

const fixture = JSON.parse(readFileSync(new URL('../shared/prayer-categories/fixture.json', import.meta.url)));
const copy = () => structuredClone(fixture);
const ids = (items) => items.map((item) => item.id).sort();
const initial = () => prayerStoragePlan(new Map([['prayers', copy().prayers], ['prayerCategories', copy().categories]])).desired;
const find = (content, id) => content.categories.find((c) => c.id === id);

test('shared Flutter fixture: old field, empty folder, manual/tag/legacy union, no descendants', () => {
  for (const c of fixture.cases.filter((c) => c.expectedDirectIds)) {
    const category = find(fixture, c.categoryId);
    assert.deepEqual(ids(directCategoryPrayers(fixture.prayers, category)), [...c.expectedDirectIds].sort(), c.caseId);
  }
  assert.deepEqual(prayerCategoryMatch(fixture.prayers.find((p) => p.id === 'both'), find(fixture, 'root')),
    { tagged: true, manual: true, legacy: false, matches: true });
  assert.equal(prayerCategoryMatch({ id: 'p', tags: [] }, { name: 'Personal', tags: ['x'] }).matches, false);
});

test('Public vs Priest vs Admin: restriction wins for manual intersection and inherited parents', () => {
  const stored = initial();
  const c = canonicalPrayerContent(stored);
  const expected = fixture.cases.find((c) => c.caseId.startsWith('C05'));
  assert.deepEqual(ids(stored.get('priestProtectedPrayers')), [...expected.expectedProtectedPrayerIds].sort());
  assert.deepEqual(ids(stored.get('priestProtectedCategories')), [...expected.expectedProtectedCategoryIds].sort());
  const publicContent = permittedPrayerContent(c.prayers, c.categories);
  assert.ok(!JSON.stringify(publicContent).includes('PRIVATE'));
  assert.deepEqual(ids(directCategoryPrayers(publicContent.prayers, find(c, 'root'))), ['both', 'manual', 'tagged']);
  for (const role of ['Priest', 'Admin']) assert.deepEqual(ids(permittedPrayerContent(c.prayers, c.categories, true).prayers), ids(c.prayers), role);
  assert.equal(prayerStoragePlan(stored).operations.length, 0);
});

test('membership edit/reload preserves IDs, order, icon and manual-only members without touching prayers', () => {
  const before = initial(), c = canonicalPrayerContent(before);
  const originalPrayers = structuredClone(c.prayers);
  find(c, 'root').prayerIds = find(c, 'root').prayerIds.filter((id) => id !== 'both');
  validateCategoryChange(find(c, 'root'), c.categories, c.prayers);
  const plan = prayerStoragePlan(before, c), after = canonicalPrayerContent(plan.desired);
  assert.deepEqual(after.prayers, originalPrayers);
  assert.ok(directCategoryPrayers(after.prayers, find(after, 'root')).some((p) => p.id === 'both'));
  assert.ok(find(after, 'root').prayerIds.includes('manual'));
  assert.equal(find(after, 'root').order, 10); assert.equal(find(after, 'root').iconId, 'folder');
  assert.equal(prayerStoragePlan(plan.desired).operations.length, 0);
});

test('remove protected manual link and change parent recompute physical storage atomically', () => {
  const before = initial(), c = canonicalPrayerContent(before);
  find(c, 'closed').prayerIds = [];
  let plan = prayerStoragePlan(before, c);
  assert.ok(plan.desired.get('prayers').some((p) => p.id === 'shared-private'));
  assert.ok(plan.operations.some((op) => op.type === 'delete' && op.collection === 'priestProtectedPrayers' && op.id === 'shared-private'));
  const moved = canonicalPrayerContent(plan.desired);
  find(moved, 'middle').parentId = 'closed';
  plan = prayerStoragePlan(plan.desired, moved);
  assert.ok(!plan.desired.get('prayers').some((p) => p.id === 'leaf-prayer'));
  assert.ok(plan.desired.get('priestProtectedPrayers').some((p) => p.id === 'leaf-prayer'));
  assert.equal(find(canonicalPrayerContent(plan.desired), 'leaf').priestOnly, false);
  assert.ok(!permittedPrayerContent(moved.prayers, moved.categories).prayers.some((p) => ['leaf-prayer', 'inherited-private', 'own-private'].includes(p.id)));
});

test('tree order, two levels, collapsed/expanded, ancestor context, hidden parent and personal categories', () => {
  const c = copy(), allowed = permittedPrayerContent(c.prayers, c.categories);
  const menu = buildPrayerCategoryMenu(allowed.categories, [{ name: 'Personal', tags: ['root-tag'] }], [], allowed.prayers);
  assert.deepEqual(ids(menu.filter((c) => c.scope === 'global')), fixture.cases.find((c) => c.caseId.startsWith('C06')).expectedPublicMenuIds.sort());
  const tree = buildCategoryTree(menu);
  assert.equal(flattenCategoryTree(tree).some((c) => c.id === 'leaf'), false);
  const expanded = flattenCategoryTree(tree, new Set(['root', 'middle']));
  assert.equal(expanded.find((c) => c.id === 'leaf').depth, 2);
  assert.equal(flattenCategoryTree(tree, new Set(['root'])).some((c) => c.id === 'leaf'), false);
  assert.deepEqual(flattenCategoryTree(tree, new Set(), (c) => c.id === 'leaf').map((c) => c.id), ['root', 'middle', 'leaf']);
  const hidden = buildCategoryTree(buildPrayerCategoryMenu(allowed.categories, [], ['root'], allowed.prayers));
  assert.equal(hidden[0].id, 'middle');
  assert.equal(menu.at(-1).scope, 'personal');
  const sorted = buildCategoryTree([{id:'z',name:'B',order:1},{id:'a',name:'A',order:1},{id:'x',name:'X',order:0}]);
  assert.deepEqual(sorted.map((c) => c.id), ['x','a','z']);
});

test('same-name global siblings in separate branches retain distinct IDs', () => {
  const c = [{id:'a',name:'A'},{id:'b',name:'B'},{id:'x',name:'Same',parentId:'a'},{id:'y',name:'Same',parentId:'b'}];
  assert.equal(buildPrayerCategoryMenu(c).length, 4);
});

test('cycles, self links, unknown parents, depth and invalid manual IDs are rejected; old malformed graphs fail closed', () => {
  const c = copy(), root = find(c,'root');
  for (const parentId of ['root', 'leaf', 'unknown']) assert.throws(() => validateCategoryChange({...root,parentId},c.categories,c.prayers));
  for (const prayerIds of [['manual','manual'], ['missing'], [42], 'manual']) assert.throws(() => validateCategoryChange({...root,prayerIds},c.categories,c.prayers));
  validateCategoryChange({...find(c,'folder')},c.categories,c.prayers);
  const bad = [{id:'a',name:'A',parentId:'b',prayerIds:['x']},{id:'b',name:'B',parentId:'a'},{id:'c',name:'C',parentId:'missing',prayerIds:['y']}];
  const p = [{id:'x'},{id:'y'}];
  assert.deepEqual(permittedPrayerContent(p,bad), {prayers:[],categories:[]});
  assert.equal(flattenCategoryTree(buildCategoryTree(bad)).length, 3);
  const deep = Array.from({length:MAX_CATEGORY_DEPTH + 1},(_,i)=>({id:String(i),name:String(i),parentId:i?String(i-1):null,tags:[],prayerIds:[],order:0}));
  assert.throws(()=>validateCategoryChange(deep.at(-1),deep,[]), /глыбокая/);
  assert.equal(prayerAccessPolicy([],deep).categoryRestricted(deep.at(-1).id),true);
});

test('last tag removal preserves folders, children and manual IDs; category deletion cleans legacy links only', () => {
  const c = copy();
  const plan = buildPrayerTagRemovalPlan('root-tag',c.prayers,c.categories);
  assert.equal(plan.deletedCategories,0); assert.equal(plan.categoryChanges[0].type,'update');
  Object.assign(find(c,'root'),{tags:plan.categoryChanges[0].tags});
  assert.ok(find(c,'middle')); assert.ok(find(c,'root').prayerIds.includes('manual'));
  assert.throws(()=>removeCategoryFromContent(c,'root'),/падкатэгорыі/);
  c.prayers.push({id:'many',categoryId:'legacy',categoryIds:['legacy','root'],tags:[]});
  const count=c.prayers.length; removeCategoryFromContent(c,'legacy');
  assert.equal(c.prayers.length,count); assert.equal(c.prayers.find(p=>p.id==='many').categoryId,undefined);
  assert.deepEqual(c.prayers.find(p=>p.id==='many').categoryIds,['root']);
});

test('large manual membership produces a dry-run exceeding the existing atomic budget', () => {
  const prayers = Array.from({length:205},(_,i)=>({id:`p${i}`,priestOnly:false}));
  const before=prayerStoragePlan(new Map([['prayers',prayers],['prayerCategories',[{id:'c',name:'C',priestOnly:true}]]])).desired;
  const c=canonicalPrayerContent(before);find(c,'c').prayerIds=prayers.map(p=>p.id);
  const plan=prayerStoragePlan(before,c);
  assert.ok(plan.operations.length > MAX_ATOMIC_CONTENT_WRITES);
  assert.equal(before.get('prayers').length,205,'dry-run does not apply');
});

test('real gzip bundle retains optional prayerIds; protected collection codec preserves manual IDs', () => {
  const stored=initial();
  const out=mkdtempSync(path.join(os.tmpdir(),'mybrev-categories-'));
  try {
    writeBundle(stored,new Map([...stored.keys()].map(k=>[k,1000])),1000,out,{log:()=>{}});
    const decode=(name)=>{const payload=JSON.parse(gunzipSync(readFileSync(path.join(out,`${name}.json.gz`))));return Object.values(decodeCollection(payload));};
    const categories=decode('prayerCategories'), prayers=decode('prayers');
    assert.deepEqual(categories.find(c=>c.id==='root').prayerIds,['manual','both','shared-private']);
    assert.equal(categories.find(c=>c.id==='legacy').prayerIds,undefined,'no forced schema rewrite of old docs');
    assert.ok(!JSON.stringify({categories,prayers}).includes('PRIVATE'));
    const protectedRows=stored.get('priestProtectedCategories');
    const encoded=encodeCollection(protectedRows);
    assert.deepEqual(Object.values(decodeCollection(encoded)).map(c=>c.prayerIds),protectedRows.map(c=>c.prayerIds));
  } finally { rmSync(out,{recursive:true,force:true}); }
});
