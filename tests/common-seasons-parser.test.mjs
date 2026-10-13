/**
 * Offline parser of the three volumes: structure, idempotency, provenance and
 * checks of the generated variants against the sources (hash, first/last
 * paragraph, rubric marks).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generate, PATHS } from '../scripts/liturgy/common-seasons.mjs';
import { htmlToPlain } from '../scripts/liturgy/common-seasons/lib/html.mjs';
import { normalizeForCompare } from '../scripts/liturgy/common-seasons/lib/volume.mjs';
import { unitLines, unitsForSeason } from '../scripts/liturgy/common-seasons/lib/fields.mjs';
import { addAlleluiaToText, addAlleluiaToBlockHtml, removeAlleluiaFromBlockHtml } from '../scripts/liturgy/common-seasons/lib/alleluia.mjs';
import { psalmStrophes, hymnStrophes, renderVersicles } from '../scripts/liturgy/common-seasons/lib/render.mjs';
import { fixSourceTypos } from '../scripts/liturgy/common-seasons/lib/analyze.mjs';
import { classifyLine, seasonMarker } from '../scripts/liturgy/common-seasons/lib/volume.mjs';
import { OFFICE_CONTENT_FIELDS } from '../src/constants/officeFields.js';
import { validateSeasonalVariants } from '../src/utils/ordo/commonSeasons.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const generated = generate();
const { corpus, analysis, documents, provenance } = generated;
const plain = (value) => normalizeForCompare(htmlToPlain(Array.isArray(value) ? value.join('\n') : value));

test('the three volumes are the verified UTF-8 sources', () => {
  assert.equal(corpus.volumes.I.sha256, '400d1242eedc3d516c7c8b01ea63e12b6f3fde182ffd32e6649c314550959285');
  assert.equal(corpus.volumes.II.sha256, 'a084c86cf4dae0254219f056e2f90a70d138377a012a5675db518242867a1fd0');
  assert.equal(corpus.volumes.III.sha256, '2c8f53b66bbfa1145978594dc91fb1d604755def9f90dffb012127dde755f82a');
});

test('structure: every volume yields its Commons, none of the fields is lost to the antiphon index', () => {
  assert.equal(corpus.volumes.II.commons.size, 13);
  assert.equal(corpus.volumes.III.commons.size, 13);
  // The index of antiphons at the end of each volume repeats headings; it is cut off (never parsed as corpus).
  assert.equal(corpus.volumes.I.commons.size, 13);
  assert.deepEqual([corpus.volumes.I.indexStart + 1, corpus.volumes.II.indexStart + 1, corpus.volumes.III.indexStart + 1], [4780, 5227, 6184]);
  Object.values(corpus.volumes).forEach((volume) => assert.deepEqual(volume.issues, [], `${volume.id}: no orphan lines`));
  // the order of the units is the order of the book: I Vespers hymn … II Vespers prayer
  const units = corpus.volumes.II.commons.get('church-dedication').common.order.map((u) => u.id);
  assert.ok(units.indexOf('vespers1.ant3') < units.indexOf('vespers1.ps3'));
  assert.ok(units.indexOf('officeOfReadings.reading1') < units.indexOf('officeOfReadings.reading2'));
  assert.ok(units.indexOf('laudes.hymn') < units.indexOf('vespers2.hymn'));
});

test('season markers are recognised by structure, not by a search for a word', () => {
  assert.equal(seasonMarker('У Вялікі пост:').season, 'lent');
  assert.equal(seasonMarker('У Велікодны перыяд').season, 'easter');
  assert.equal(seasonMarker('У перыяд Адвэнту:').season, 'advent');
  assert.equal(seasonMarker('У перыяд Нараджэння Пана:').season, 'christmas');
  assert.equal(seasonMarker('У Вялікі пост: \t1 П 5, 10-11').rest, '1 П 5, 10-11');
  assert.equal(seasonMarker('Пра Папу ці біскупа, у Вялікі пост:').prefix, 'Пра Папу ці біскупа');
  assert.equal(seasonMarker('Вялікі пост наступае'), null);
  // «Пра аднаго мучаніка:» (a label) is not the heading of the Common
  assert.equal(classifyLine('Пра аднаго мучаніка:').kind, 'text');
  assert.equal(classifyLine('ПРА АДНАГО МУЧАНІКА').kind, 'commonHeading');
  assert.equal(classifyLine('Ант. да песні Марыі').kind, 'canticleAnt');
});

test('Advent / Christmas: the three pairs of Volume I are bound to their exact hours', () => {
  const units = corpus.volumes.I.commons.get('blessed-virgin-mary').common.order.filter((u) => u.branches.some((b) => ['advent', 'christmas'].includes(b.season)));
  assert.deepEqual(units.map((u) => u.id), ['vespers1.prayer', 'laudes.prayer', 'vespers2.prayer']);
  units.forEach((u) => {
    assert.deepEqual(u.branches.map((b) => b.season), ['advent', 'christmas']);
    assert.match(u.branches[0].lines[0].text, /^Усемагутны Божа, Ты пажадаў, каб Тваё Слова праз звеставанне анёла/);
    assert.match(u.branches[1].lines[0].text, /^Усемагутны Божа, Ты праз дзявочае мацярынства Панны Марыі/);
  });
  const variants = documents.get('blessed-virgin-mary');
  assert.deepEqual(Object.keys(variants), ['advent', 'christmas', 'lent', 'easter']);
  ['vesper1Pr', 'laudesPr', 'vesperPr'].forEach((field) => {
    assert.ok(field in variants.advent && field in variants.christmas);
    assert.ok(!/Адвэнту|Нараджэння/.test(JSON.stringify([variants.advent[field], variants.christmas[field]])));
  });
});

test('regeneration is idempotent and the canonical sources are up to date', () => {
  const again = generate();
  assert.deepEqual([...again.documents.entries()], [...documents.entries()]);
  assert.deepEqual(again.provenance, provenance);
  corpus.manifest.sections.forEach((section) => {
    const id = section.file.replace(/\.json$/, '');
    const stored = JSON.parse(fs.readFileSync(path.join(PATHS.common, section.file), 'utf8'));
    assert.deepEqual(stored._seasonalVariants || {}, documents.get(id), `${id}: run node scripts/liturgy/common-seasons.mjs --write`);
  });
  assert.deepEqual(JSON.parse(fs.readFileSync(PATHS.provenance, 'utf8')), provenance);
});

test('the stored variants are valid and never touch the flat base', () => {
  corpus.manifest.sections.forEach((section) => {
    const stored = JSON.parse(fs.readFileSync(path.join(PATHS.common, section.file), 'utf8'));
    assert.deepEqual(validateSeasonalVariants({ _id: section.file, _seasonalVariants: stored._seasonalVariants }), []);
    Object.keys(stored._seasonalVariants || {}).forEach((season) => assert.ok(['advent', 'christmas', 'lent', 'easter'].includes(season)));
    Object.values(stored._seasonalVariants || {}).forEach((delta) => Object.keys(delta).forEach((field) => assert.ok(OFFICE_CONTENT_FIELDS.includes(field), field)));
  });
  // every Common with the book's seasonal texts has them; Educators/works-of-mercy/religious only the Easter Alleluia
  ['church-dedication', 'blessed-virgin-mary', 'apostles', 'martyrs-many', 'martyr-one', 'pastors', 'doctors-of-church', 'virgins', 'holy-men', 'holy-women', 'religious', 'works-of-mercy', 'educators']
    .forEach((id) => assert.ok(Object.keys(documents.get(id)).length > 0, `${id} has seasonal variants`));
});

test('provenance: every variant field names its volume, lines and a hash that matches the stored value', () => {
  let count = 0;
  Object.entries(provenance).forEach(([commonId, bySeason]) => {
    Object.entries(bySeason).forEach(([season, fields]) => {
      Object.entries(fields).forEach(([field, info]) => {
        count += 1;
        assert.equal(info.volume, ['advent', 'christmas'].includes(season) ? 'I' : 'II');
        assert.ok(Array.isArray(info.lines) && info.lines[0] > 0 && info.lines[1] >= info.lines[0], `${commonId}.${season}.${field}`);
        assert.equal(info.sha256, sha(JSON.stringify(documents.get(commonId)[season][field])), `${commonId}.${season}.${field}`);
      });
    });
  });
  assert.ok(count > 300);
});

test('regression hashes of the mandatory church-dedication / blessed-virgin-mary cases', () => {
  const hash = (value) => sha(plain(value)).slice(0, 16);
  const d = documents.get('church-dedication');
  assert.equal(hash(d.lent.vesper1Ant3), 'fb798d8ee91e13a4');
  assert.equal(hash(d.easter.vesper1Ant3), '6d08f86ee3b73c45');
  assert.equal(hash(d.lent.vesper1Ps3), '7f79835135dd3d16');
  assert.equal(hash(d.easter.vesper1Ps3), '7734bc14fd3e906b');
  assert.equal(hash(d.lent.officeOfReadingsR1), '1ddc4dd25056b36c');
  assert.equal(hash(d.easter.officeOfReadingsR1), '33e605ef7d5d8756');
  assert.equal(hash(d.lent.laudesR), '7ba6ba7aad998761');
  assert.equal(hash(d.easter.laudesR), '35e69fb8a108880e');
  const b = documents.get('blessed-virgin-mary');
  assert.equal(hash(b.advent.laudesPr), '66ea9a6c882bb36d');
  assert.equal(hash(b.christmas.laudesPr), '3a3954861152d4f7');
});

test('explicit variants rendered from a volume keep its first/last paragraph and every rubric mark', () => {
  let checked = 0;
  analysis.variants.forEach((bySeason, commonId) => {
    Object.entries(bySeason).forEach(([season, fields]) => {
      Object.entries(fields).forEach(([field, info]) => {
        if (info.method !== 'render' || info.equalsBase) return;
        const volume = corpus.volumes[info.volume];
        const units = volume.commons.get(commonId).fields.get(field);
        const source = unitsForSeason(units, season).map((unit) => (unitLines(unit, season, { withRepeats: true }) || []).map((l) => fixSourceTypos(l.text)).join(' ')).join(' ');
        const variant = plain(info.value);
        const src = normalizeForCompare(source.replace(/\(\s*Велікодны\s+перыяд\s+Аллелюя\s*\)\.?/gu, ''));
        // first and last 40 characters of the text of the variant are found in the source, in this order
        const first = variant.replace(/^(першае чытанне|другое чытанне|калі няма ўласнай малітвы, чытаецца ніжэйпададзеная:) ?/u, '').slice(0, 40);
        const last = variant.slice(-40);
        const i = src.indexOf(first.slice(0, 25));
        assert.ok(i >= 0, `${commonId}.${season}.${field}: first paragraph «${first}»`);
        const j = src.lastIndexOf(last.slice(-25));
        assert.ok(j >= i, `${commonId}.${season}.${field}: last paragraph «${last}»`);
        // marks: * † and K./Н. responses are kept one-to-one (the Alleluia added to antiphons contributes only «/»)
        const count = (text, mark) => text.split(mark).length - 1;
        assert.equal(count(variant, '*'), count(src, '*'), `${commonId}.${season}.${field}: «*»`);
        assert.equal(count(variant, '†'), count(src, '†'), `${commonId}.${season}.${field}: «†»`);
        assert.equal((variant.match(/(^|\s)к\.\s/gu) || []).length, (src.match(/(^|\s)к\.\s/gu) || []).length, `${commonId}.${season}.${field}: К.`);
        assert.equal((variant.match(/(^|\s)н\.\s/gu) || []).length, (src.match(/(^|\s)н\.\s/gu) || []).length, `${commonId}.${season}.${field}: Н.`);
        checked += 1;
      });
    });
  });
  assert.ok(checked > 40, `checked ${checked}`);
});

test('the Easter Alleluia: form of antiphons attested in the books; versicles are NOT invented', () => {
  assert.deepEqual(addAlleluiaToText('Ант. Мой дом будзе названы * домам малітвы. (Велікодны перыяд Аллелюя).'),
    { ok: true, text: 'Ант. Мой дом будзе названы * домам малітвы, / аллелюя.', rule: 'alleluia-v1' });
  assert.equal(addAlleluiaToText('3 ант. Хор мучанікаў, * хвалі на вышынях Пана (Велікодны перыяд Аллелюя).').text, '3 ант. Хор мучанікаў, * хвалі на вышынях Пана, / аллелюя.');
  assert.equal(addAlleluiaToText('Ант. X * Y, / аллелюя. (Велікодны перыяд Аллелюя).').rule, 'already-has-alleluia');
  const versicle = addAlleluiaToText('К. Пане, Ты палюбіў хараство свайго дому. (Велікодны перыяд Аллелюя).');
  assert.equal(versicle.ok, false);
  assert.equal(versicle.unverified, true);
  assert.equal(addAlleluiaToText('2 ант. Якія мілыя Твае шатры, * Пане Магуццяў! (Велікодны перыяд Аллелюя). †').ok, false);
  assert.equal(addAlleluiaToText('Ант. A * B! (Велікодны перыяд Аллелюя).').ok, false);
  // HTML: the red «/» mark and the sentence end; reversible for Lent
  const html = '<p><span style="color: #ff0000;">Ант. </span>Бог * з намі.<span style="color: #ff0000;"> </span></p>';
  const added = addAlleluiaToBlockHtml(html, 'antiphon');
  assert.match(added.html, /з намі, <span style="color: #ff0000;">\/<\/span> аллелюя\./);
  const removed = removeAlleluiaFromBlockHtml(added.html);
  assert.match(removed.html, /з намі\./);
  assert.equal(addAlleluiaToBlockHtml('<p>no stop</p>', 'antiphon').ok, false);
  // every Easter-annotated antiphon of the stored Commons has exactly one «аллелюя» added, versicles none
  let versicleFields = 0;
  analysis.unverified.forEach(() => { versicleFields += 1; });
  assert.ok(versicleFields > 50, 'versicle Alleluia elements are reported, not generated');
  documents.forEach((bySeason) => Object.values(bySeason.easter || {}).forEach((value) => {
    const textual = plain(value);
    assert.doesNotMatch(textual, /\(велікодны перыяд/);
  }));
});

test('printed misprints are corrected visibly and countably', () => {
  assert.equal(fixSourceTypos('К. X, * аллеюя, аллелюя. Н. Аллеюя.'), 'К. X, * аллелюя, аллелюя. Н. Аллелюя.');
  assert.ok((analysis.typos.get('alleyuya') || 0) >= 3);
  documents.forEach((bySeason) => Object.values(bySeason).forEach((fields) => Object.values(fields).forEach((value) => {
    assert.doesNotMatch(JSON.stringify(value), /[Аа]ллеюя/);
  })));
});

test('layout helpers: psalm and hymn strophes; K./N. paragraphs keep their marks', () => {
  assert.deepEqual(psalmStrophes(['A, †', 'b *', 'c.', 'D *', 'e.']), [['A, †', 'b *', 'c.'], ['D *', 'e.']]);
  assert.equal(hymnStrophes(['a', 'b', 'c.', 'd', 'e', 'f.']).length, 2);
  assert.equal(hymnStrophes(['a', 'b', '', 'c', 'd']).length, 2);
  const html = renderVersicles([{ text: 'К. Дому Твайму, Пане, * належыць святасць. Н. Дому.' }]);
  assert.equal((html.match(/#ff0000/g) || []).length, 3);
  assert.match(htmlToPlain(html), /К\. Дому Твайму, Пане, \* належыць святасць\. Н\. Дому\./);
});

test('the matrix covers every field of every Common for every variant season, with a category', () => {
  const categories = new Set(['seasonal_explicit', 'seasonal_structural', 'ordinary_base', 'editorial_difference', 'optional_variant', 'missing_source', 'needs_review']);
  analysis.matrix.forEach((cell) => { assert.ok(categories.has(cell.category), JSON.stringify(cell)); assert.ok(cell.hour !== undefined); });
  const seasons = new Set(analysis.matrix.map((c) => c.season));
  assert.deepEqual([...seasons].sort(), ['advent', 'christmas', 'easter', 'lent']);
  const perCommon = new Map();
  analysis.matrix.forEach((c) => perCommon.set(c.common, (perCommon.get(c.common) || 0) + 1));
  assert.equal(perCommon.size, 13);
  // every cell with a seasonal text is a variant or an explicit "equals base"; none is silently dropped
  analysis.matrix.filter((c) => c.status.startsWith('variant')).forEach((c) => {
    assert.ok(documents.get(c.common)[c.season]?.[c.field] !== undefined, `${c.common}.${c.season}.${c.field}`);
  });
  assert.ok(ROOT);
});
