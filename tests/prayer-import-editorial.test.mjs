import assert from 'node:assert/strict';
import test from 'node:test';
import { planCanonical } from '../scripts/prayer-import/lib/plan-canon.mjs';
import { readFileSync } from 'node:fs';

const SOURCES = JSON.parse(readFileSync(new URL('../scripts/prayer-import/sources.json', import.meta.url), 'utf8'));
const EDITORIAL = JSON.parse(readFileSync(new URL('../scripts/prayer-import/editorial-decisions.json', import.meta.url), 'utf8'));

function meta(entryId, sourceId, title, page) {
  return { entryId, sourceId, title, kind: 'prayer', status: 'complete', pdfPageStart: page, pdfPageEnd: page, printedPageStart: page, printedPageEnd: page };
}
const block = (text) => ({ type: 'paragraph', runs: [{ text }] });
const TEXT = 'Пане Божа, май ласку паслаць нам на дапамогу святога арханёла Рафала.';
function corpus(entries) {
  return {
    index: entries.map((e) => e.meta),
    readEntry: (m) => entries.find((e) => e.meta.entryId === m.entryId).entry,
    sourceHashes: {},
  };
}
const entry = (m, text) => ({ meta: m, entry: { title: m.title, blocks: [block(text)], qaFlags: [] } });

test('editorial decisions: titles of the three «Малітва за Айчыну» are kept distinct', () => {
  const ids = Object.keys(EDITORIAL.titleOverrides);
  assert.equal(ids.length, 3);
  const entries = ids.map((id, i) => entry(meta(id, 'our_father_needs', 'Малітва за Айчыну', 277 + i), `Божа, Валадару і Пане народаў ${i}`));
  const plan = planCanonical({ corpus: corpus(entries), sources: SOURCES, oldPrayers: [], categories: [], editorial: EDITORIAL });
  const titles = plan.operations.map((op) => op.title);
  assert.deepEqual(new Set(titles).size, 3);
  assert.ok(titles.includes('Малітва за Айчыну (паводле а. Пятра Скаргі)'));
  assert.ok(titles.includes('Малітва за Айчыну (паводле св. Яна Паўла ІІ)'));
  assert.ok(titles.includes('Малітва за Айчыну (чытаецца на заканчэнне года)'));
});

test('editorial decisions: the same Raphael prayer printed twice becomes ONE public prayer', () => {
  const [dup, keep] = [Object.keys(EDITORIAL.duplicateOf)[0], EDITORIAL.duplicateOf[Object.keys(EDITORIAL.duplicateOf)[0]].keep];
  const entries = [entry(meta(dup, 'our_father_weekly', 'Малітва да св. арханёла Рафала (Аўторак)', 182), TEXT), entry(meta(keep, 'our_father_saints', 'Малітва да св. арханёла Рафала', 233), TEXT)];
  const plan = planCanonical({ corpus: corpus(entries), sources: SOURCES, oldPrayers: [], categories: [], editorial: EDITORIAL });
  assert.equal(plan.operations.filter((op) => op.action === 'CREATE').length, 1);
  const skipped = plan.operations.find((op) => op.action === 'SKIP_DUPLICATE');
  assert.equal(skipped.sourceEntryId, dup);
  assert.equal(skipped.keepEntryId, keep);
  assert.equal(skipped.targetId, undefined);
});

test('editorial decisions: only the five approved renames may change a live title', () => {
  const old = [{ id: 'OLDX', title: 'Малітва да святога арханёла Рафала', text: TEXT }];
  const m = meta('our_father_saints-px', 'our_father_saints', 'Малітва да св. арханёла Рафала', 233);
  const run = (editorial) => planCanonical({ corpus: corpus([entry(m, TEXT)]), sources: SOURCES, oldPrayers: old, categories: [], editorial });
  // An unapproved rename is refused at plan time.
  assert.throws(() => run(EDITORIAL), /Unapproved title change for OLDX/);
  // Once the owner approves exactly that rename it plans as REPLACE_KEEP_ID with the new title.
  const plan = run({ ...EDITORIAL, approvedTitleChanges: { ...EDITORIAL.approvedTitleChanges, OLDX: 'Малітва да св. арханёла Рафала' } });
  const op = plan.operations.find((item) => item.action === 'REPLACE_KEEP_ID');
  assert.equal(op.targetId, 'OLDX');
  assert.equal(op.title, 'Малітва да св. арханёла Рафала');
  assert.equal(Object.keys(EDITORIAL.approvedTitleChanges).length, 5);
});
