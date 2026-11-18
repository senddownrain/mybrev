import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateXiSundaySource, XI_SOURCE_PATH, XI_TARGET } from '../scripts/liturgy/patch-xi-sunday-first-vespers.mjs';
import { planXiSundayAtomicRelease } from '../scripts/content/publish-xi-sunday-targeted.mjs';
import { CONTENT_SCHEMA_VERSION, collectionDigest, documentHash, storedDocument } from '../scripts/content/lib/app-content.mjs';

const fields = validateXiSundaySource(JSON.parse(fs.readFileSync(XI_SOURCE_PATH, 'utf8')));
const day = { _periodType: 'ordinary', _periodWeekNumber: 11, _dayOfWeek: 1,
  vesper1Hymn: '', vesper1Pr: '', untouched: 'do not change this',
};
const prior = documentHash(storedDocument(XI_TARGET, day));
const ids = [XI_TARGET,'ordinary-w1-d1','ordinary-w10-d7'];
const hashes = Object.fromEntries(ids.map((id,i) => [id, i ? 'other-unchanged-hash-' + i : prior]));
const sizes = Object.fromEntries(ids.map((id,i) => [id, i ? 200+i : Buffer.byteLength(JSON.stringify(storedDocument(XI_TARGET,day)))]));
const digest = collectionDigest(hashes);
const index = { collection:'days', hashes, sizes, digest, version: 8 };
const current = { schemaVersion: CONTENT_SCHEMA_VERSION, contentVersion: 10000,
  collections: { days: { digest, version: 8, count: 3, bytes: Object.values(sizes).reduce((a,b)=>a+b,0) },
    readings: { digest: 'unchanged-other-collection', version: 2 } } };

test('dry run targets only the XI Sunday day and exactly its two manifest records', () => {
  const p = planXiSundayAtomicRelease({ day, index, current, fields, now: 20000 });
  assert.equal(p.status,'SAFE SINGLE DAY CONTENT PATCH');
  assert.ok(Object.keys(p.dayUpdates).length > 0);
  assert.equal(p.nextIndex.hashes['ordinary-w10-d7'],index.hashes['ordinary-w10-d7']);
  assert.equal(p.nextIndex.sizes['ordinary-w1-d1'],index.sizes['ordinary-w1-d1']);
  assert.deepEqual(p.nextCurrent.collections.readings,current.collections.readings);
  assert.equal(p.versionAfter,9);
  assert.equal(p.nextCurrent.contentVersion,20000);
});

test('reject wrong source selector, conflict in a nonempty field, or corrupt existing digests',()=>{
  assert.throws(()=>planXiSundayAtomicRelease({day:{...day,_periodWeekNumber:12},index,current,fields}));
  assert.throws(()=>planXiSundayAtomicRelease({day:{...day,vesper1Pr:'wrong-but-nonempty'},index,current,fields}));
  assert.throws(()=>planXiSundayAtomicRelease({day,index:{...index,digest:'bad'},current,fields}));
});

test('idempotent when all eleven fields and published manifest already match',()=>{
  const fixed={...day,...fields};
  const hash=documentHash(storedDocument(XI_TARGET,fixed));
  const sz=Buffer.byteLength(JSON.stringify(storedDocument(XI_TARGET,fixed)));
  const nh={...hashes,[XI_TARGET]:hash},ns={...sizes,[XI_TARGET]:sz},nd=collectionDigest(nh);
  const ni={...index,hashes:nh,sizes:ns,digest:nd,version:9};
  const nc={...current,collections:{...current.collections,days:{...current.collections.days,digest:nd,version:9}}};
  const p=planXiSundayAtomicRelease({day:fixed,index:ni,current:nc,fields});
  assert.equal(p.status,'ALREADY PUBLISHED');
  assert.equal(Object.keys(p.dayUpdates).length,0);
  assert.equal(p.changedIndex,false);
});
