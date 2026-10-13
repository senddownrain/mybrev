import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PRAYER_TEXT_FORMAT as format, renderPrayerMarkdown, prayerSpeakerRanges,
  prayerMarkdownToPlainText, parsePrayerMarkdown, renderPrayerInline,
  autoFixPrayerMarkdown, htmlToPrayerMarkdown, diagnosePrayerMarkdown,
  promotePrayerRubrics, validatePrayerMarkdown,
} from '../src/utils/prayerMarkdown.js';
import { auditPrayerFormatting, safePrayerFormatting } from '../scripts/lib/prayer-format-audit.mjs';
import { buildPrayerAutofixPlan } from '../scripts/autofix-prayer-markdown.mjs';

test('all supported bare labels preserve punctuation and spoken words', () => {
  const labels = { 'К.': 'cantor', 'С.': 'priest', 'Н.': 'people', 'Д.': 'deacon', 'Л.': 'reader', 'Ц.': 'celebrant', 'V.': 'versicle', 'R.': 'response', 'С.:': 'priest', 'Н.:': 'people' };
  for (const [label, role] of Object.entries(labels)) {
    const source = `${label} Пан з вамі.\n${label} І з духам тваім.`;
    const html = renderPrayerMarkdown(source, format);
    assert.equal((html.match(/class="prayer-speaker"/g) || []).length, 2);
    assert.ok(html.includes(`data-role="${role}">${label}</span> Пан з вамі.`));
    assert.equal(prayerMarkdownToPlainText(source, format), source);
    assert.deepEqual(prayerSpeakerRanges(source).map((range) => source.slice(range.from, range.to)), [label, label]);
  }
});

test('paragraphs, hard breaks and long litany responses keep labels and text', () => {
  const source = 'К. Пане, пачуй нас.  \nН. ' + 'Змілуйся над намі. '.repeat(80) + '\n\nС. Молімся.\nПане, пачуй нас.';
  const html = renderPrayerMarkdown(source, format);
  assert.equal((html.match(/class="prayer-speaker"/g) || []).length, 3);
  assert.match(html, /<br>/);
  assert.match(html, /<\/span> Молімся\./);
  assert.doesNotMatch(html, /Народ адказвае|Кантар пачынае/);
});

test('initials, lookalikes, prose, quoted narrative and explicit Markdown are excluded', () => {
  const source = [
    'С. Я. Купала', 'К. Купала', 'Тэкст: Н. І з духам тваім.', 'Народ моліцца.',
    'C. Пан з вамі.', 'K. Пан з вамі.', 'H. І з духам тваім.', 'N. Name',
    '> С. Пан з вамі.\n> Н. І з духам тваім.',
    '[С. Пан з вамі.](/prayer/id)', '`Н. І з духам тваім.`',
    '## С. Пан з вамі.', '**С. Пан з вамі.**',
    ':::rubric\nС. Пан з вамі.\n:::',
    '```md\nК. Пане, пачуй нас.\n```', '    Н. І з духам тваім.',
  ].join('\n\n');
  assert.deepEqual(prayerSpeakerRanges(source), []);
  assert.doesNotMatch(renderPrayerMarkdown(source, format), /prayer-speaker/);
});

test('links and ordinary emphasis in a response retain their semantics', () => {
  const source = 'Н. _Молімся._ [Малітва](/prayer/id)\nК. **Пане, пачуй нас.**';
  const html = renderPrayerMarkdown(source, format);
  assert.match(html, /<\/span> <em>Молімся\.<\/em> <a href="\/prayer\/id">/);
  assert.match(html, /<\/span> <strong>Пане, пачуй нас\.<\/strong>/);
  assert.doesNotMatch(html, /prayer-rubric/);
});

test('raw HTML and unsafe URLs cannot execute in canonical Markdown', () => {
  const html = renderPrayerMarkdown('С. Пан з вамі.\n<script>alert(1)</script>\n[bad](javascript:alert(1))\n<img src=x onerror=alert(1)>', format);
  assert.doesNotMatch(html, /<script>|<img|href="javascript:/);
  assert.match(html, /&lt;script&gt;/);
});

test('plain text strips structural tokens, preserves underscores and quoted words', () => {
  assert.equal(prayerMarkdownToPlainText('> Н. І з духам тваім.\n\n[Спасылка](/prayer/id)\n\n`some_identifier`\n\n:::rubric\nУсе ўстаюць.\n:::', format),
    'Н. І з духам тваім.\n\nСпасылка\n\nsome_identifier\n\nУсе ўстаюць.');
});

test('Mass parsing and inline rendering never receive generic speaker spans', () => {
  const source = 'С. Пан з вамі.\nН. І з духам тваім.';
  assert.equal(parsePrayerMarkdown(source, format).find((token) => token.type === 'inline').content, source);
  assert.doesNotMatch(renderPrayerInline('V. Dominus vobiscum.'), /prayer-speaker/);
});

test('Word paste preserves formulas and explicit rubric class without invented roles', () => {
  const source = '<p><em>Молімся.</em></p><p>К. Пане, пачуй нас.</p><p class="rubric">Усе ўстаюць.</p><script>alert(1)</script>';
  const md = htmlToPrayerMarkdown(source);
  assert.equal(md, '_Молімся._\n\nК. Пане, пачуй нас.\n\n:::rubric\nУсе ўстаюць.\n:::');
  assert.match(renderPrayerMarkdown(md, format), /data-role="cantor"/);
});

test('safe plans preserve metadata and ambiguous sources; review is separate', () => {
  const document = { id: 'private', text: '\uFEFFС.: Пан з вамі.\r\nН.: І з духам тваім.', textVersions: { be: '#Загаловак', la: '> V. Dominus vobiscum.' }, tags: ['private'], priestOnly: true };
  const original = structuredClone(document);
  const plan = buildPrayerAutofixPlan([document]);
  assert.equal(plan.length, 1);
  assert.deepEqual(plan[0].updates.map((update) => update.field), ['text']);
  assert.equal(plan[0].updates[0].after, 'С.: Пан з вамі.\nН.: І з духам тваім.');
  assert.deepEqual(document, original);
  assert.deepEqual(buildPrayerAutofixPlan([{ ...document, text: plan[0].updates[0].after }]), []);
  const audit = auditPrayerFormatting([document]);
  assert.equal(audit.scannedDocuments, 1);
  assert.equal(audit.scannedVersions, 3);
  assert.equal(audit.counts.safe, 1);
  assert.ok(audit.counts.review > 0);
  assert.equal(audit.fields[1].proposals[0].severity, 'review');
});

test('audit covers empty, invalid localized fields and malformed rubrics', () => {
  const audit = auditPrayerFormatting([{ id: 'test', textVersions: { be: '', la: 12, en: ':::rubric\nН. Amen.' } }]);
  assert.equal(audit.scannedVersions, 2);
  assert.equal(audit.nonStringFields, 1);
  assert.ok(audit.counts.manual >= 3);
  assert.deepEqual(buildPrayerAutofixPlan([{ id: 'test', text: '\uFEFF:::rubric\r\nOpen' }]), []);
});

test('technical proposals are idempotent and never strip quotes or alter code', () => {
  for (const source of ['#Загаловак\n\n• Пункт', '**\nСловы\n**', '> С.: Пан з вамі.', '```md\n#Title\n:::rubric\n```']) {
    const fixed = autoFixPrayerMarkdown(source).markdown;
    assert.equal(autoFixPrayerMarkdown(fixed).markdown, fixed);
    assert.equal(safePrayerFormatting(safePrayerFormatting(source)), safePrayerFormatting(source));
    if (source.startsWith('>') || source.startsWith('```')) assert.equal(fixed, source);
  }
  assert.ok(diagnosePrayerMarkdown('С.: Пан з вамі.\nH. Name').some((finding) => finding.code === 'ambiguous-label'));
});

test('synthetic litany, devotion and Way of the Cross keep authored sections and formulas', () => {
  for (const source of [
    '## Літанія\n\nК. Пане, змілуйся над намі.\nН. Хрыстэ, змілуйся над намі.\nСвятая Марыя,\n_маліся за нас._',
    '## Стацыя I\n\nС. Кланяемся Табе, Хрыстэ.\nН. Бо праз крыж Твой Ты адкупіў свет.\n\n:::rubric\nУсе кленчаць.\n:::',
    '_Перад пачаткам навэнны._\n\nК. Пане, пачуй нас.\nН. Амэн.\n\n[Іншая малітва](/prayer/id)',
  ]) {
    assert.match(renderPrayerMarkdown(source, format), /prayer-speaker/);
    assert.equal(autoFixPrayerMarkdown(source).markdown, source);
    assert.equal(prayerMarkdownToPlainText(source, format).includes('Кантар пачынае'), false);
  }
});

test('rubric proposals protect quotations, speaker lines, lists and code', () => {
  const source = '> Святар кажа:\n\nК. Кантар спявае.\n\n- Святар кажа:\n\n## Святар кажа:';
  assert.deepEqual(promotePrayerRubrics(source), { markdown: source, changed: false, rubricsAdded: 0 });
  assert.deepEqual(validatePrayerMarkdown('```md\n:::rubric\n```'), []);
  assert.equal(safePrayerFormatting('\uFEFF\uFEFFТэкст'), 'Тэкст');
});
