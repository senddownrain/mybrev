import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { prayerMarkdownToPlainText, validatePrayerMarkdown } from '../../src/utils/prayerMarkdown.js';
import { resolvePrayerSource, sourceForSave } from '../../src/utils/prayerSource.mjs';
import { catalogValueJson } from './access-sets-v2-content-values.mjs';
import { buildPublicPrayerCatalog, publicPrayerRows, validatePublicPrayerCatalog } from '../../src/utils/publicPrayerCatalog.mjs';

const SOURCE_ID = 'ojcha-nash-2022';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const digest = (value) => sha(catalogValueJson(value));
const idFor = (key) => {
  assert.match(key, /^sacraments(?:\.[a-z]+(?:-[a-z]+)*){0,2}$/u);
  return key.replaceAll('.', '-');
};
const normalize = (text) => String(text ?? '').normalize('NFKC').toLocaleLowerCase('be')
  .replace(/[’‘ʼ]/gu, "'").replace(/[‐‑‒–—]/gu, '-').replace(/\u00ad/gu, '').replace(/\s+/gu, ' ').trim();
const same = (a, b) => catalogValueJson(a) === catalogValueJson(b);
const textOf = (runs) => runs.map(({ text, marker }) => text ?? marker).join('');
const escapeMarkdown = (text) => text.replace(/[\\*_+<>&[\]~|\x60]/gu, '\\$&');
const asRubric = (text) => [':::rubric', text, ':::'].join('\n');
const withEmphasis = (text, delimiter) => text.replace(/^(\s*)(.*?)(\s*)$/su, (original, start, words, end) =>
  words ? start + delimiter + words + delimiter + end : original);

function renderRuns(runs) {
  return runs.map((run) => {
    const value = escapeMarkdown(run.text ?? run.marker);
    const delimiter = (run.bold ? '**' : '') + (run.italic ? '_' : '');
    return delimiter ? withEmphasis(value, delimiter) : value;
  }).join('');
}

function renderBlock(block) {
  let text = renderRuns(block.runs);
  if (block.inlineRubrics?.length) {
    // MyBrev v1 has block rubrics only. Keep the short aside inline in italics.
    assert.equal(block.inlineRubrics.length, 1);
    assert.equal(block.runs.length, 1);
    const [{ start, length, text: rubric }] = block.inlineRubrics;
    const original = Array.from(textOf(block.runs));
    assert.equal(original.slice(start, start + length).join(''), rubric);
    text = escapeMarkdown(original.slice(0, start).join(''))
      + withEmphasis(escapeMarkdown(rubric), '_')
      + escapeMarkdown(original.slice(start + length).join(''));
  }
  if (block.number) text = text.replace(/^(\d+)\./u, '$1\\.');
  if (['heading', 'heading-continuation', 'source-group-heading', 'source-heading'].includes(block.type)) {
    return '### ' + text.trim();
  }
  if (block.rubric || ['rubric', 'instruction'].includes(block.type)) return asRubric(text);
  return text;
}

function verifyVersionedText(blocks, notes, markdown, key) {
  assert.ok(markdown.trim() && !validatePrayerMarkdown(markdown).length, key);
  const plain = [...blocks.map(({ runs }) => textOf(runs)), ...notes.map(({ marker, runs }) => marker + textOf(runs))]
    .join('\n');
  const displayed = prayerMarkdownToPlainText(markdown, 'mybrev-markdown').replace(/\s+/gu, ' ').trim();
  assert.equal(displayed, plain.replace(/\s+/gu, ' ').trim(), key);
  assert.ok(!/\[[^\]]+\]\(/u.test(markdown), 'Unexpected unresolved source link');
}

export function loadSacraments(directory) {
  const root = resolve(directory);
  const read = (file, expected) => {
    const path = resolve(root, file);
    assert.ok(path.startsWith(root + sep), 'Invalid package path');
    const data = readFileSync(path);
    if (expected) assert.equal(sha(data), expected, file);
    return JSON.parse(data);
  };
  const manifest = read('SACRAMENTS_MANIFEST.json');
  assert.equal(manifest.formatVersion, 1);
  assert.equal(manifest.language, 'be');
  const source = sourceForSave(manifest.source.registry.canonicalValue);
  assert.equal(manifest.source.registry.edition, 5);
  assert.equal(resolvePrayerSource(source).sourceId, SOURCE_ID);
  const { categories } = read(manifest.categoryFile, manifest.categoriesSha256);
  assert.deepEqual(categories, manifest.categories);
  assert.deepEqual(categories.map(({ entryKeys }) => entryKeys.length), [0, 2, 3, 6, 7, 3, 0, 3]);
  const entries = new Map();
  const comments = new Map();
  for (const unitMeta of manifest.units) {
    const unit = read(unitMeta.file, unitMeta.sha256);
    const { key, title, kind, categoryKey, blocks, sourceHeading, footnotes } = unit;
    assert.equal(key, unitMeta.key);
    assert.equal(unit.visibility, 'public');
    assert.equal(unit.source.registryKey, SOURCE_ID);
    assert.ok(title.trim() && blocks.length);
    const groupHeadings = manifest.sourceGroupHeadings.filter(({ entryKeys }) => entryKeys[0] === key);
    const contentBlocks = [...groupHeadings.map((block) => ({ ...block, type: 'source-group-heading' })),
      ...(kind === 'comment' && sourceHeading ? [{ ...sourceHeading, type: 'source-heading' }] : []), ...blocks];
    const notes = footnotes.filter(({ status }) => status === 'present');
    const markdown = [...contentBlocks.map(renderBlock), ...notes.map(({ marker, runs }) => escapeMarkdown(marker) + renderRuns(runs))]
      .filter(Boolean).join('\n\n').trim();
    verifyVersionedText(contentBlocks, notes, markdown, key);
    if (kind === 'comment') {
      assert.ok(!comments.has(key));
      comments.set(key, { categoryKey, value: { title, content: markdown, sourceId: SOURCE_ID } });
    } else {
      const sourceMarker = (sourceHeading?.runs || []).filter(({ footnoteRef }) => footnoteRef).map(({ marker }) => marker).join('');
      assert.ok(!entries.has(key));
      entries.set(key, { categoryKey, id: idFor(key), patch: {
        title: title + sourceMarker, text: markdown, textFormat: 'mybrev-markdown', textFormatVersion: 1,
        tags: [], source, sourceManual: false, sourceId: SOURCE_ID,
      } });
    }
  }
  assert.equal(entries.size, 24);
  assert.equal(comments.size, 8);
  const usedEntries = new Set();
  const tree = categories.map(({ key, title, parentKey, order, visibility, commentKey, entryKeys }, index) => {
    assert.equal(visibility, 'public');
    assert.equal(parentKey, index ? categories[0].key : null);
    assert.equal(order, index);
    const comment = comments.get(commentKey);
    assert.equal(comment.categoryKey, key);
    for (const entryKey of entryKeys) {
      assert.equal(entries.get(entryKey)?.categoryKey, key);
      assert.ok(!usedEntries.has(entryKey));
      usedEntries.add(entryKey);
    }
    return { id: idFor(key), entryKeys, patch: {
      name: title, parentId: parentKey && idFor(parentKey), order, tags: [], comment: comment.value,
    } };
  });
  assert.equal(usedEntries.size, 24);
  assert.equal(new Set([...tree, ...entries.values()].map(({ id }) => id)).size, 32);
  return { entries, tree, digest: digest({ entries: Object.fromEntries(entries), tree }) };
}

function belarusian(rows) {
  return rows.map((row) => {
    const title = row.titleVersions?.be ?? row.title ?? '';
    const text = row.textVersions?.be ?? row.text ?? '';
    return { row, title, text, plain: normalize(prayerMarkdownToPlainText(text, row.textFormat)) };
  });
}

export function prepareSacraments(bundle, input) {
  const visible = publicPrayerRows(input);
  const candidates = belarusian(visible.prayers);
  const protectedPrayers = new Set(input.protectedPrayers?.map(({ id }) => id));
  const protectedCategories = new Set(input.protectedCategories?.map(({ id }) => id));
  const edits = [];
  const placements = [];
  for (const [key, { id, patch }] of bundle.entries) {
    assert.ok(!protectedPrayers.has(id), 'Reserved prayer ID is protected: ' + id);
    const stored = input.prayers.find((row) => row.id === id);
    const wantedText = normalize(prayerMarkdownToPlainText(patch.text, patch.textFormat));
    const matches = candidates.filter((item) => item.row.id === id || item.plain === wantedText || normalize(item.title) === normalize(patch.title));
    if (stored) assert.ok(matches.some(({ row }) => row.id === id), 'Reserved prayer ID is unpublished: ' + id);
    const exact = matches.filter(({ row, title, text }) =>
      title === patch.title && text === patch.text && row.textFormat === patch.textFormat
      && row.textFormatVersion === 1 && resolvePrayerSource(row.source ?? row.sourceBook).sourceId === SOURCE_ID
      && (!row.sourceId || row.sourceId === SOURCE_ID));
    assert.ok(exact.length <= 1 && exact.length === matches.length,
      'Review public prayer matches for ' + id + ': ' + matches.map(({ row }) => row.id).join(', '));
    const match = exact[0]?.row;
    if (!match) edits.push({ kind: 'prayers', id, action: 'create', patch });
    placements.push({ key, id: match?.id ?? id, action: match ? match.id === id ? 'no-op' : 'reuse' : 'create' });
  }
  const placementIds = new Map(placements.map(({ key, id }) => [key, id]));
  assert.equal(new Set(placementIds.values()).size, 24, 'A prayer would occupy more than one placement');
  const categories = bundle.tree.map(({ id, entryKeys, patch }) => {
    assert.ok(!protectedCategories.has(id), 'Reserved category ID is protected: ' + id);
    const candidate = input.categories.find((row) => row.id === id);
    const prayerIds = entryKeys.map((key) => placementIds.get(key));
    const expected = { ...patch, prayerIds };
    const nameConflict = visible.categories.find((row) => row.id !== id && normalize(row.name) === normalize(patch.name)
      && (row.parentId || null) === patch.parentId);
    assert.ok(!nameConflict, 'Category already exists under another ID: ' + nameConflict?.id);
    if (candidate) {
      assert.ok(visible.categories.some((row) => row.id === id)
        && Object.entries(expected).every(([field, value]) => same(candidate[field] ?? null, value)),
      'Reserved category differs: ' + id);
    } else edits.push({ kind: 'categories', id, action: 'create', patch: expected });
    return { id, parentId: patch.parentId, action: candidate ? 'no-op' : 'create', prayerIds, sourceId: patch.comment.sourceId };
  });
  const summary = { payloadSha256: bundle.digest, placements, categories, counts: {
    create: placements.filter(({ action }) => action === 'create').length,
    reuse: placements.filter(({ action }) => action === 'reuse').length,
    update: 0, noOp: placements.filter(({ action }) => action === 'no-op').length,
    categories: categories.length, comments: categories.length, placements: placements.length,
  } };
  return { edits, summary };
}

export const publicPath = (kind, id) => (kind === 'categories' ? 'prayerCategories/' : 'prayers/') + id;
export function checkCreateOperations(edits, operations) {
  const expected = new Map(edits.map(({ kind, id, patch }) => [publicPath(kind, id), patch]));
  assert.equal(operations.length, expected.size, 'Writer would change other documents');
  for (const { path, before, after } of operations) {
    assert.ok(expected.has(path) && before === null && after, 'Writer would replace or move a document: ' + path);
    assert.deepEqual(Object.fromEntries(Object.keys(expected.get(path)).map((key) => [key, after[key]])), expected.get(path));
    assert.deepEqual(Object.keys(after).filter((key) => !Object.hasOwn(expected.get(path), key)
      && !(['priestOnly', 'effectivePriestOnly'].includes(key) && after[key] === false)), [],
    'Unexpected fields in writer payload: ' + path);
    expected.delete(path);
  }
}

export function publicInput(documents) {
  const input = { prayers: [], categories: [], protectedPrayers: [], protectedCategories: [] };
  const names = { prayers: 'prayers', prayerCategories: 'categories', priestProtectedPrayers: 'protectedPrayers',
    protectedPrayers: 'protectedPrayers', priestProtectedCategories: 'protectedCategories', protectedCategories: 'protectedCategories' };
  for (const [path, row] of documents) {
    const [collection, id] = path.split('/');
    if (Object.hasOwn(names, collection)) input[names[collection]].push({ ...row, id });
  }
  return input;
}

export function simulateSacraments(bundle, catalog) {
  const input = validatePublicPrayerCatalog(catalog);
  const prepared = prepareSacraments(bundle, input);
  const draft = { prayers: [...input.prayers], categories: [...input.categories] };
  for (const { kind, id, patch } of prepared.edits) draft[kind].push({ ...patch, id });
  const artifact = buildPublicPrayerCatalog(draft);
  const final = prepareSacraments(bundle, validatePublicPrayerCatalog(artifact));
  assert.equal(final.edits.length, 0, 'Import is not idempotent through the public artifact');
  for (const { id, prayerIds } of prepared.summary.categories) {
    assert.deepEqual(artifact.categories.find((row) => row.id === id)?.prayerIds, prayerIds);
    assert.equal(artifact.categoryComments[id].sourceId, SOURCE_ID);
  }
  return { artifact, prepared };
}
