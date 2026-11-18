import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { contextFromQuery, readingFeedbackLink, feedbackLocationForRoute } from '../src/utils/feedbackContext.js';

const source = (file) => readFileSync(new URL(`../src/${file}`, import.meta.url), 'utf8');

test('Liturgy feedback appears after NextHourLink, with spacing below its divider', () => {
  const layout = source('layouts/simple/One.vue');
  const next = layout.indexOf('<NextHourLink />');
  const feedback = layout.indexOf('<FeedbackPrompt class="ora-feedback" />');
  assert.ok(next >= 0 && feedback > next, 'Feedback must follow the next-hour navigation');
  assert.match(layout, /margin-bottom: calc\(88px \+ env\(safe-area-inset-bottom, 0px\)\)/);
  assert.match(source('components/liturgical/NextHourLink.vue'), /margin: 8px auto 0;/);
});

test('Readings feedback is below the reading, not during loading or errors', () => {
  const readings = source('components/readings/ReadingsView.vue');
  const parsed = readings.indexOf('<ParsedReadingCard :reading="activeReading" />');
  const footer = readings.indexOf('<FeedbackPrompt');
  const back = readings.indexOf('<BackToTop bottom-nav />');
  assert.ok(parsed >= 0 && footer > parsed && back > footer);
  assert.match(readings, /v-if="!isLoading && !error"/);
  assert.match(readings, /readingFeedbackLink\(/);
});

test('Reading feedback keeps the selected document, date, and safe return path', () => {
  const link = readingFeedbackLink({
    id: 'readings-abc_12',
    date: '2026-11-18',
    title: 'XXXIII звычайны тыдзень',
    path: '/readings',
  });
  assert.deepEqual(link, {
    name: 'Feedback',
    query: {
      ctx_kind: 'reading',
      ctx_id: 'readings-abc_12',
      ctx_date: '2026-11-18',
      ctx_title: 'XXXIII звычайны тыдзень',
      ctx_path: '/readings',
    },
  });
  assert.deepEqual(contextFromQuery(link.query), {
    kind: 'reading',
    id: 'readings-abc_12',
    date: '2026-11-18',
    title: 'XXXIII звычайны тыдзень',
    lang: 'be',
    path: '/readings',
  });
  const unsafe = readingFeedbackLink({ id: '<script>', date: 'invalid', path: 'https://example.com' });
  assert.deepEqual(unsafe.query, { ctx_kind: 'reading' });
});

test('Compendium has one footer across routes and preserves question-specific context', () => {
  const shell = source('views/CompendiumShell.vue');
  assert.equal((shell.match(/<FeedbackPrompt/g) || []).length, 1);
  assert.match(shell, /v-if="!resultsOpen"/);
  assert.match(shell, /const question = store\.getQuestion\(route\.params\.number\)/);
  assert.match(shell, /ctx_title: title\.slice\(0, 120\)/);
  assert.match(shell, /\.prayer-view-container\.compendium-reader/);
  const location = feedbackLocationForRoute({
    name: 'CompendiumQuestion', params: { number: '13' }, path: '/compendium/question/13',
  });
  assert.deepEqual(location.query, {
    ctx_kind: 'compendium',
    ctx_id: '13',
    ctx_path: '/compendium/question/13',
  });
});

test('Readings have one divider when a reading card is followed by feedback', () => {
  const readings = source('components/readings/ReadingsView.vue');
  const card = source('components/readings/ParsedReadingCard.vue');
  const prompt = source('components/common/FeedbackPrompt.vue');

  // The card's own lower border supplies the single visible divider.
  assert.match(card, /\.parsed-reading\s*\{[^}]*border:\s*1px solid var\(--reader-border\)/s);
  assert.match(prompt, /\.feedback-prompt\s*\{[^}]*border-top:\s*1px solid var\(--nav-border\)/s);
  assert.match(readings, /:class="\{ 'readings-feedback--after-card': !!activeReading \}"/);
  assert.match(readings, /\.readings-feedback--after-card\s*\{[^}]*border-top:\s*0;/s);
  // Empty readings do not have a card, so the generic footer divider remains.
  assert.match(readings, /v-if="!isLoading && !error"/);
});
