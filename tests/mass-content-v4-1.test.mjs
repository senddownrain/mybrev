import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildMassDocument } from '../src/utils/massContent.js';
import { getMassVariant, resolveMassSectionTarget } from '../src/utils/massRitual.js';
import {
  LATIN_MASS_FIELDS, LATIN_MASS_ID, LATIN_MASS_MAJOR_HEADINGS, LATIN_MASS_SERVICE_REPLACEMENTS,
  assertLatinMassV41Change, normalizeLatinMassServiceText, planLatinMassV41, sha256,
} from '../scripts/lib/mass-content-v4-1.mjs';
import { run, parseArgs } from '../scripts/migrate-mass-latin-rubrics-v4-1.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = (file) => readFileSync(path.join(ROOT, file), 'utf8');
const specimen = `#### ЧИН МЕССЫ НА ЛАТИНСКОМ ЯЗЫКЕ

## Уступныя абрады

V. In nomine Patris, et Filii, et Spiritus Sancti.

R. Amen.

:::rubric
Или:
:::

:::rubric
(молитва из Миссала)
:::

## Літургія слова

:::rubric
После чтения:
:::

V. Verbum Domini.

:::rubric
Евангелие:
:::

:::rubric
(После чтения)
:::

### Исповедание веры

Credo in unum Deum, Patrem omnipotentem.

## Эўхарыстычная літургія

### Вторая Евхаристическая молитва

V. Dominus vobiscum.

R. Et cum spiritu tuo.

## Абрад Камуніі

V. Praeceptis salutaribus moniti…

## Заключныя абрады

V. Ite, missa est.

R. Deo gratias.`;
const normalized = normalizeLatinMassServiceText(specimen).text;
const variant = getMassVariant('la');

test('V4.1 replaces exactly the eight approved Russian service lines and is idempotent', () => {
  const result = normalizeLatinMassServiceText(specimen);
  assert.equal(result.changed, true);
  LATIN_MASS_SERVICE_REPLACEMENTS.forEach(([before, after]) => {
    assert.equal(result.counts[before], 1, before);
    assert.ok(result.text.includes(after), after);
    assert.ok(!result.text.includes(before), before);
  });
  assert.deepEqual(result.text.split('\n').filter((line) => line.startsWith('## ')), LATIN_MASS_MAJOR_HEADINGS.map((title) => `## ${title}`));
  assert.equal(normalizeLatinMassServiceText(result.text).changed, false);
  assert.doesNotThrow(() => assertLatinMassV41Change(specimen, result.text));
});

test('V4.1 rejects Latin wording, punctuation, markup, extra lines and unreviewed Cyrillic', () => {
  const reject = (value, pattern) => assert.throws(() => assertLatinMassV41Change(specimen, value), pattern);
  reject(normalized.replace('R. Amen.', 'R. Amen!'), /Unapproved Latin Mass change/);
  reject(normalized.replace('V. Verbum Domini.', 'V. Verbum Dei.'), /Unapproved Latin Mass change/);
  reject(normalized.replace('### Вызнанне веры', '## Вызнанне веры'), /five V4 major headings/);
  reject(`${normalized}\n`, /line count changed/);
  reject(normalized.replace(':::rubric\nАльбо:', ':::rubric\nАльбо!'), /Unreviewed Cyrillic/);
  assert.throws(() => normalizeLatinMassServiceText(specimen.replace('Или:', 'Русская новая рубрика')), /Unreviewed Cyrillic/);
});

test('new Belarusian markers preserve semantic sections, rubric classes and V./R. roles', () => {
  const before = buildMassDocument(specimen, variant, 'mybrev-markdown');
  const after = buildMassDocument(normalized, variant, 'mybrev-markdown');
  const shape = (doc) => doc.blocks.map((block) => [block.type, block.sectionId || '', block.role || '', block.speakerLabel || '']);
  assert.deepEqual(shape(after), shape(before));
  const ids = after.sections.map((section) => section.sectionId);
  for (const id of ['introductory-rites', 'liturgy-of-the-word', 'creed', 'eucharistic-liturgy', 'eucharistic-prayer', 'communion-rite', 'concluding-rites']) {
    assert.equal(resolveMassSectionTarget(id, ids), id);
  }
  assert.equal(after.blocks.find((block) => block.text === 'ПАРАДАК СВЯТОЙ ІМШЫ НА ЛАЦІНСКАЙ МОВЕ').type, 'heading');
  assert.equal(after.blocks.find((block) => block.text === 'Альбо:').type, 'alternative');
  assert.equal(after.blocks.find((block) => block.text === 'Пасля чытання:').type, 'rubric');
  assert.equal(after.blocks.find((block) => block.text === 'Евангелле:').type, 'rubric');
  assert.deepEqual(after.blocks.filter((block) => block.type === 'majorSection').map((block) => block.text), LATIN_MASS_MAJOR_HEADINGS);
  assert.deepEqual(variant.markers.creed.slice(0, 2), ['Вызнанне веры', 'Исповедание веры']);
  assert.deepEqual(variant.markers['eucharistic-prayer'].slice(0, 2), ['II эўхарыстычная малітва', 'Вторая Евхаристическая молитва']);
  assert.deepEqual(variant.anchors['first-reading'], ['Пасля чытання:', 'После чтения:']);
  assert.deepEqual(variant.anchors.gospel, ['Евангелле:', 'Евангелие:']);
  assert.deepEqual(variant.classify.heading, ['ПАРАДАК СВЯТОЙ ІМШЫ НА ЛАЦІНСКАЙ МОВЕ', 'ЧИН МЕССЫ НА ЛАТИНСКОМ ЯЗЫКЕ']);
  assert.deepEqual(variant.classify.rubric, ['Пасля чытання:', 'После чтения:', 'Евангелле:', 'Евангелие:']);
  assert.deepEqual(variant.classify.alternative, ['Альбо:', 'Или:']);
});

test('planner accepts only the three identical Latin Mass text fields', () => {
  const data = { textVersions: { be: specimen, la: specimen, ru: specimen }, title: 'Ordo Missae' };
  const plan = planLatinMassV41({ exists: true, data, updateTime: 't1' });
  assert.equal(plan.status, 'update');
  assert.deepEqual(plan.fields.map((field) => field.path), LATIN_MASS_FIELDS);
  assert.deepEqual(plan.fields.map((field) => field.beforeSha256), [sha256(specimen), sha256(specimen), sha256(specimen)]);
  assert.throws(() => planLatinMassV41({ exists: true, data: { ...data, text: specimen } }), /Unexpected top-level/);
  assert.throws(() => planLatinMassV41({ exists: true, data: { ...data, textVersions: { ...data.textVersions, la: `${specimen}\n` } } }), /textVersions differ/);
});

test('CLI dry run backs up untouched data; apply uses the reviewed plan and is idempotent', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'mass-v4-1-'));
  const data = { title: 'Ordo Missae', tags: ['Святая Імша'], textVersions: { be: specimen, la: specimen, ru: specimen } };
  const source = {
    source: 'firestore:ibreviaryby',
    updateTime: 't1', data: structuredClone(data), writes: [],
    async get() { return { exists: true, data: structuredClone(this.data), updateTime: this.updateTime }; },
    async update(fields) {
      this.writes.push(Object.keys(fields));
      for (const [field, value] of Object.entries(fields)) this.data.textVersions[field.split('.')[1]] = value;
      this.updateTime = 't2';
    },
  };
  const args = ['--backup-dir', path.join(directory, 'backups'), '--report-dir', path.join(directory, 'reports')];
  const dry = await run(args, { source, now: '2026-10-02T00:00:00.000Z', log: () => {} });
  assert.equal(dry.result.status, 'would-update');
  assert.deepEqual(source.writes, []);
  assert.deepEqual(source.data, data);
  const backup = JSON.parse(readFileSync(path.join(directory, 'backups/2026-10-02T00-00-00-000Z', `${LATIN_MASS_ID}.json`), 'utf8'));
  assert.deepEqual(backup.data, data);
  const report = readFileSync(path.join(directory, 'reports/report.md'), 'utf8');
  assert.match(report, /-Или:\n\+Альбо:/);
  const applied = await run([...args, '--apply'], { source, now: '2026-10-02T00:00:01.000Z', log: () => {} });
  assert.equal(applied.result.status, 'updated');
  assert.deepEqual(source.writes, [LATIN_MASS_FIELDS]);
  assert.equal(source.data.title, data.title);
  assert.deepEqual(source.data.tags, data.tags);
  assert.equal(source.data.textVersions.la, normalized);
  const again = await run([...args, '--apply'], { source, now: '2026-10-02T00:00:02.000Z', log: () => {} });
  assert.equal(again.result.status, 'already-applied');
  assert.equal(source.writes.length, 1);
  const post = await run(args, { source, now: '2026-10-02T00:00:03.000Z', log: () => {} });
  assert.equal(post.result.status, 'unchanged');
  assert.ok(post.document.fields.every((field) => !field.changed));
  assert.throws(() => parseArgs(['--apply', '--snapshot', directory]), /must read live/);
});

test('apply refuses a changed updateTime before writing', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'mass-v4-1-'));
  const source = {
    source: 'firestore:ibreviaryby', updateTime: 't1', writes: 0,
    data: { textVersions: { be: specimen, la: specimen, ru: specimen } },
    async get() { return { exists: true, data: structuredClone(this.data), updateTime: this.updateTime }; },
    async update() { this.writes += 1; },
  };
  const args = ['--backup-dir', path.join(directory, 'backups'), '--report-dir', path.join(directory, 'reports')];
  await run(args, { source, now: '2026-10-02T00:01:00.000Z', log: () => {} });
  source.updateTime = 't2';
  await assert.rejects(run([...args, '--apply'], { source, now: '2026-10-02T00:01:01.000Z', log: () => {} }), /changed since dry run/);
  assert.equal(source.writes, 0);
});

const realReport = path.join(ROOT, 'reports/mass-v4-1');
test('real dry-run output has no Russian service lines and preserves semantic block shape', { skip: !existsSync(path.join(realReport, `${LATIN_MASS_ID}.textVersions.la.before.md`)) }, () => {
  for (const field of LATIN_MASS_FIELDS) {
    const before = read(`reports/mass-v4-1/${LATIN_MASS_ID}.${field}.before.md`);
    const after = read(`reports/mass-v4-1/${LATIN_MASS_ID}.${field}.after.md`);
    assertLatinMassV41Change(before, after);
    const oldDoc = buildMassDocument(before, variant, 'mybrev-markdown');
    const newDoc = buildMassDocument(after, variant, 'mybrev-markdown');
    const shape = (doc) => doc.blocks.map((block) => [block.type, block.sectionId || '', block.role || '', block.speakerLabel || '']);
    assert.deepEqual(shape(newDoc), shape(oldDoc));
    LATIN_MASS_SERVICE_REPLACEMENTS.forEach(([russian]) => assert.ok(!after.includes(russian), russian));
    assert.equal(after.split('\n').filter((line) => line.startsWith('## ')).length, 5);
  }
});
