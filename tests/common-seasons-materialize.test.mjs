/** Pure unit tests of the seasonal materializer and the `_seasonalVariants` validator. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMMON_SEASON_KEYS, hasSeasonalVariants, materializeCommonForSeason, seasonalTemplateGetter, seasonalVariantKeys,
  validateSeasonalVariants, variantKeyForSeason,
} from '../src/utils/ordo/commonSeasons.js';

const deepFreeze = (value) => {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) { Object.freeze(value); Object.values(value).forEach(deepFreeze); }
  return value;
};
const template = () => deepFreeze({
  _id: 'church-dedication',
  _kind: 'common',
  title: 'T',
  vesper1Ant3: '<p>base ant3</p>',
  vesper1Ps3: '<p>base psalm</p>',
  laudesPr: ['<p>a</p>', '<p>b</p>'],
  laudesPs1: undefined,
  _fieldRules: { laudesPs1: { source: 'sunday-week-1' } },
  _seasonalVariants: {
    lent: { vesper1Ant3: '<p>lent ant3</p>', vesper1Ps3: '<p>lent psalm</p>', laudesPr: ['<p>lent</p>'], laudesHymn: null, laudesPs1: { rule: { ref: 'vesperHymn' } } },
    easter: { vesper1Ant3: '<p>easter ant3</p>' },
    advent: {},
  },
});

test('Ordo period → variant key; Holy Week follows Lent, the Triduum and Ordinary Time take the flat base', () => {
  assert.equal(variantKeyForSeason({ period: 'advent', periodPhase: 'dec17-24' }), 'advent');
  assert.equal(variantKeyForSeason({ period: 'christmas', periodPhase: 'octave' }), 'christmas');
  assert.equal(variantKeyForSeason({ period: 'lent', periodPhase: 'ash-days' }), 'lent');
  assert.equal(variantKeyForSeason({ period: 'holyweek', periodPhase: 'palm-sunday' }), 'lent');
  assert.equal(variantKeyForSeason({ period: 'holyweek', periodPhase: 'holy-week' }), 'lent');
  assert.equal(variantKeyForSeason({ period: 'holyweek', periodPhase: 'triduum' }), null);
  assert.equal(variantKeyForSeason({ period: 'easter', periodPhase: 'pentecost' }), 'easter');
  assert.equal(variantKeyForSeason({ period: 'ordinary', periodPhase: 'before-lent' }), null);
  assert.equal(variantKeyForSeason('lent'), 'lent');
  assert.equal(variantKeyForSeason(null), null);
  assert.deepEqual([...COMMON_SEASON_KEYS], ['advent', 'christmas', 'lent', 'easter']);
});

test('a template without variants, and an ordinary-season date, are returned as the very same object', () => {
  const plain = deepFreeze({ _id: 'x', vesper1Ant3: '<p>a</p>' });
  assert.equal(materializeCommonForSeason(plain, { period: 'lent' }), plain);
  assert.equal(materializeCommonForSeason(null, { period: 'lent' }), null);
  const t = template();
  assert.equal(materializeCommonForSeason(t, { period: 'ordinary' }), t);
  assert.equal(materializeCommonForSeason(t, undefined), t);
  assert.equal(materializeCommonForSeason(t, { period: 'christmas' }), t, 'no christmas delta: inherit');
  assert.equal(materializeCommonForSeason(t, { period: 'advent' }), t, 'empty delta: inherit');
  assert.deepEqual(seasonalVariantKeys(t), ['lent', 'easter']);
  assert.ok(hasSeasonalVariants(t));
});

test('lent materialises a plain flat object: texts replaced, null = intentionally empty, rule overrides, nothing mutated', () => {
  const t = template();
  const lent = materializeCommonForSeason(t, { period: 'lent', periodPhase: 'lent-weeks' });
  assert.notEqual(lent, t);
  assert.equal(lent.vesper1Ant3, '<p>lent ant3</p>');
  assert.equal(lent.vesper1Ps3, '<p>lent psalm</p>');
  assert.deepEqual(lent.laudesPr, ['<p>lent</p>']);
  assert.ok(!('_seasonalVariants' in lent), 'consumers never see the delta object');
  assert.ok(!('laudesHymn' in lent));
  assert.deepEqual(lent._fieldRules.laudesHymn, { omit: true });
  assert.deepEqual(lent._fieldRules.laudesPs1, { ref: 'vesperHymn' });
  assert.deepEqual(lent._seasonal.variant, 'lent');
  assert.deepEqual(new Set(lent._seasonal.fields), new Set(['vesper1Ant3', 'vesper1Ps3', 'laudesPr', 'laudesHymn', 'laudesPs1']));
  ['vesper1Ant3', 'vesper1Ps3', 'laudesPr'].forEach((field) => assert.ok(typeof lent[field] === 'string' || Array.isArray(lent[field]), `${field} stays HTML text, not an object`));
  // the argument (deep-frozen) and its nested arrays are untouched
  assert.equal(t._seasonalVariants.lent.vesper1Ant3, '<p>lent ant3</p>');
  assert.deepEqual(t._fieldRules, { laudesPs1: { source: 'sunday-week-1' } });
  // arrays are copied, not shared
  assert.notEqual(lent.laudesPr, t._seasonalVariants.lent.laudesPr);
});

test('Holy Week takes Lent, the Triduum and Easter do not mix with it', () => {
  const t = template();
  assert.equal(materializeCommonForSeason(t, { period: 'holyweek', periodPhase: 'holy-week' }).vesper1Ant3, '<p>lent ant3</p>');
  assert.equal(materializeCommonForSeason(t, { period: 'holyweek', periodPhase: 'triduum' }), t);
  assert.equal(materializeCommonForSeason(t, { period: 'easter', periodPhase: 'octave' }).vesper1Ant3, '<p>easter ant3</p>');
  assert.equal(materializeCommonForSeason(t, { period: 'easter' }).vesper1Ps3, '<p>base psalm</p>', 'a field absent from the easter delta keeps the flat base');
});

test('invalid delta entries are ignored by the materializer (never a half-applied field)', () => {
  const broken = deepFreeze({
    _id: 'b', vesper1Ant3: '<p>base</p>', vesper1Ps3: '<p>base ps</p>',
    _seasonalVariants: { lent: { vesper1Ant3: 42, unknownField: '<p>x</p>', officeOfReadingsTeDeum: '<p>x</p>', vesper1Ps3: { rule: { source: 'nope' } } } },
  });
  const lent = materializeCommonForSeason(broken, { period: 'lent' });
  assert.equal(lent.vesper1Ant3, '<p>base</p>');
  assert.equal(lent.vesper1Ps3, '<p>base ps</p>');
  assert.ok(!('unknownField' in lent));
});

test('seasonalTemplateGetter materialises per call and never mixes seasons through a shared Map', () => {
  const shared = new Map([['church-dedication', template()]]);
  const lent = seasonalTemplateGetter(shared, { period: 'lent' });
  const easter = seasonalTemplateGetter(shared, { period: 'easter' });
  const ordinary = seasonalTemplateGetter(shared, { period: 'ordinary' });
  assert.equal(lent('church-dedication').vesper1Ant3, '<p>lent ant3</p>');
  assert.equal(easter('church-dedication').vesper1Ant3, '<p>easter ant3</p>');
  assert.equal(ordinary('church-dedication').vesper1Ant3, '<p>base ant3</p>');
  assert.equal(lent('church-dedication'), lent('church-dedication'), 'memoised inside one assembly');
  assert.equal(lent('missing'), null);
  assert.equal(shared.get('church-dedication').vesper1Ant3, '<p>base ant3</p>');
  assert.equal(seasonalTemplateGetter({ x: template() }, 'easter')('x').vesper1Ant3, '<p>easter ant3</p>', 'plain-object maps work too');
});

test('validator: allowed seasons and fields, value types, HTML, leftovers of the book', () => {
  const ok = { _id: 'x', _seasonalVariants: { lent: { vesper1Ant3: '<p>ok</p>', laudesHymn: null, laudesPs1: { rule: { source: 'sunday-week-1' } }, laudesPr: ['<p>a</p>'] } } };
  assert.deepEqual(validateSeasonalVariants(ok), []);
  assert.deepEqual(validateSeasonalVariants({ _id: 'x' }), []);
  const messages = (variants) => validateSeasonalVariants({ _id: 'x', _seasonalVariants: variants }).map((issue) => `${issue.path}: ${issue.message}`).join('\n');
  assert.match(messages({ ordinary: { vesper1Ant3: '<p>a</p>' } }), /unknown season/);
  assert.match(messages({ holyweek: { vesper1Ant3: '<p>a</p>' } }), /unknown season/);
  assert.match(messages({ lent: { notAField: '<p>a</p>' } }), /unknown field/);
  assert.match(messages({ lent: { officeOfReadingsTeDeum: '<p>a</p>' } }), /Te Deum/);
  assert.match(messages({ lent: { vesper1Ant3: '' } }), /empty text/);
  assert.match(messages({ lent: { vesper1Ant3: 7 } }), /must be a string/);
  assert.match(messages({ lent: { vesper1Ant3: ['<p>a</p>', 3] } }), /must be a string/);
  assert.match(messages({ lent: { vesper1Ant3: { rule: { source: 'bogus' } } } }), /invalid structured rule/);
  assert.match(messages({ lent: { vesper1Ant3: { other: 1 } } }), /only \{ rule \}/);
  assert.match(messages({ lent: { vesper1Ant3: '<p>a</p><script>x</script>' } }), /forbidden HTML/);
  assert.match(messages({ lent: { vesper1Ant3: '<p>a (Велікодны перыяд Аллелюя)</p>' } }), /editorial mark/);
  assert.match(messages({ lent: { vesper1Ant3: '<p>У Вялікі пост:</p><p>x</p><p>У Велікодны перыяд:</p>' } }), /seasonal rubric/);
  assert.match(messages({ lent: { vesper1Ant3: '<p><span>open</p>' } }), /unbalanced/);
  assert.match(messages({ lent: { vesper1Ant3: 'x'.repeat(200001) } }), /longer than/);
  assert.match(messages('nope'), /must be an object/);
  assert.match(messages({ lent: 'x' }), /object of fields/);
});
