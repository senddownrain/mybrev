/**
 * The web data-loading path, not only assembleOffice (A4 of the PR #132 verification):
 * stored Firestore document → loader shape `{ id, ...data }` (staticLiturgicalService.getLiturgicalTemplates) →
 * buildOrdoDayOptions (the cards of the day, as liturgicalContentService builds them) → the text on the Office card.
 *
 * What this does NOT prove: the state of production Firestore, the browser cache or the deployed bundle.
 * Classification of a wrong text on the site: code (these tests fail) / old production data (the stored template has no
 * `_seasonalVariants`) / cache or bundle (stale CONTENT_REVISION). `NOT VERIFIED IN BROWSER/LIVE` for the last two.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import moment from '../src/utils/moment-be.js';
import { resolveRuntimeDay } from '../src/utils/ordo/runtime.js';
import { buildOrdoDayOptions } from '../src/utils/ordoDayOptions.js';
import { buildFeastTargets } from '../scripts/ordo/import-feasts.mjs';
import { daysFixture } from './helpers/ordo-days-fixture.mjs';
import { htmlToPlain } from '../scripts/liturgy/common-seasons/lib/html.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const plain = (value) => htmlToPlain(Array.isArray(value) ? value.join('\n') : String(value ?? '')).replace(/\s+/g, ' ').trim();
const PROPERS = fs.readdirSync(path.join(ROOT, 'patchs', 'db-feasts')).filter((n) => n.endsWith('.json')).map((n) => {
  const { _id, ...rest } = JSON.parse(fs.readFileSync(path.join(ROOT, 'patchs', 'db-feasts', n), 'utf8'));
  return { id: _id, ...rest };
});
/** The Map that getLiturgicalTemplates() returns for the documents the importer would write. */
const loaded = (mutate = (doc) => doc) => new Map(buildFeastTargets().templates.map(({ id, data }) => [id, mutate({ id, ...data })]));

function cards(date, diocese, templates) {
  const resolved = resolveRuntimeDay(date, { diocese });
  const { context, daysResult } = daysFixture(resolved, { migrated: false });
  const ddmm = moment(date).format('DD.MM');
  const withPropers = { ...daysResult, properDays: PROPERS.filter((doc) => doc._date === ddmm) };
  return buildOrdoDayOptions({ resolved, daysResult: withPropers, context, date, diocese, templates });
}
const cardOf = (result, optionId) => result.dayOptions.find((option) => option.ordo?.optionId === optionId);
const officeText = (card, field) => plain(card.day?.[field] ?? card.templates?.[0]?.day?.[field]);

test('04.12.2026 Grodno: the loaded Firestore shape yields Rev 21, 9-27 on the Office card', () => {
  const card = cardOf(cards('2026-12-04', 'grodno', loaded()), 'grodno-cathedral-dedication');
  assert.ok(card, 'the card of the dedication of the Grodno cathedral is offered');
  assert.match(officeText(card, 'officeOfReadingsR1'), /Апакаліпсіса св\. апостала Яна 21, 9-27/u);
  assert.doesNotMatch(officeText(card, 'officeOfReadingsR1'), /2, 1-17/u);
});

test('cause classification: the SAME code with production-like data (no _seasonalVariants) shows 1 Pet 2, 1-17', () => {
  // This is the symptom reported for 04.12: it comes from the DATA that is loaded, not from the code path.
  const old = loaded(({ _seasonalVariants, ...rest }) => { void _seasonalVariants; return rest; });
  const card = cardOf(cards('2026-12-04', 'grodno', old), 'grodno-cathedral-dedication');
  assert.match(officeText(card, 'officeOfReadingsR1'), /Пятра[^]*2, 1-17/u);
  assert.doesNotMatch(officeText(card, 'officeOfReadingsR1'), /Апакаліпсіса/u);
});

test('other dioceses on 04.12.2026 do not get the Grodno celebration', () => {
  for (const diocese of ['minsk-mohilev', 'pinsk', 'vitebsk']) {
    const result = cards('2026-12-04', diocese, loaded());
    assert.equal(cardOf(result, 'grodno-cathedral-dedication'), undefined, diocese);
  }
});

// Matrix: every Common-based celebration of the calendar, in each special season, in all four dioceses.
// Invariant against the STORED data: where the proper has no own text for the field and no rule, the Office card shows the
// stored seasonal variant of its default Common (when it has one), and the Ordinary Time base otherwise.
const FIELD = 'officeOfReadingsR1';
const DIOCESES = ['minsk-mohilev', 'grodno', 'pinsk', 'vitebsk'];
const RANGES = { advent: ['2026-11-29', '2026-12-24'], christmas: ['2026-12-25', '2027-01-10'], lent: ['2027-02-10', '2027-03-26'], easter: ['2027-03-28', '2027-05-14'] };
const properById = new Map(PROPERS.map((doc) => [doc._celebrationId || doc.id, doc]));

test('matrix: seasons × dioceses — Common-based Office cards show the stored seasonal reading; propers keep their own text', () => {
  const templates = loaded();
  let covered = 0;
  let own = 0;
  const seen = new Map();
  for (const [season, [from, to]] of Object.entries(RANGES)) {
    for (let day = moment(from); !day.isAfter(to); day.add(1, 'day')) {
      for (const diocese of DIOCESES) {
        const date = day.format('YYYY-MM-DD');
        const result = cards(date, diocese, templates);
        for (const card of result.dayOptions) {
          const proper = properById.get(card.ordo?.optionId);
          const template = proper?._defaultTemplate && templates.get(proper._defaultTemplate);
          if (!proper || !template || (card.ordo?.contentStatus?.hours || '') === 'day-fallback') continue;
          if (!card.day || !card.day[FIELD] || card.day._currentVersion !== proper._defaultTemplate) continue;
          const expectedVariant = template._seasonalVariants?.[season]?.[FIELD];
          const shown = plain(card.day[FIELD]);
          if (plain(proper[FIELD])) { own += 1; assert.equal(shown, plain(proper[FIELD]), `${date} ${diocese} ${card.ordo.optionId}: the Proper text wins`); continue; }
          const expected = plain(expectedVariant ? (expectedVariant.html ?? expectedVariant) : template[FIELD]);
          assert.equal(shown, expected, `${date} ${diocese} ${card.ordo.optionId} (${season})`);
          covered += 1;
          seen.set(`${season}:${card.ordo.optionId}`, true);
        }
      }
    }
  }
  assert.ok(covered >= 10, `at least 10 Common-based Office cards were checked (got ${covered}); own-text propers: ${own}`);
  // Christmas (25.12–10.01) has no Common-based card without own text in the calendar: its seasonal readings are proven at the
  // assembly level in common-seasons-acceptance.test.mjs.
  for (const season of ['advent', 'lent', 'easter']) assert.ok([...seen.keys()].some((key) => key.startsWith(`${season}:`)), `${season} is covered`);
});

test('negative control: the Common in Ordinary Time (Volume III) is not the seasonal reading', () => {
  const seasonal = loaded();
  const dedication = seasonal.get('church-dedication');
  assert.ok(dedication._seasonalVariants.advent.officeOfReadingsR1);
  assert.match(plain(dedication.officeOfReadingsR1), /Пятра[^]*2, 1-17/u);
});
