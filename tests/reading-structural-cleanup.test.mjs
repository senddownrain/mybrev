import test from 'node:test';
import assert from 'node:assert/strict';
import { proseReadingPatch, structuralReadingPatch } from '../scripts/lib/reading-structural-cleanup.mjs';

test('prose cleanup preserves narrative and intro while extracting title and trailing markers', () => {
  const title = '+ Чытанне святога Евангелля паводле Яна.';
  const paragraphs = Array.from({ length: 8 }, (_, index) => `Абзац ${index}: ${'Захаваны тэкст. '.repeat(8)}`);
  const source = { id: 'example', gospel: { bible: 'Ян', title: 'стары ўступ', text: [title, 'У той час:', ...paragraphs, 'а', 'альбо'].join('\n\n') } };
  const patch = proseReadingPatch(source);
  assert.equal(patch.gospel.title, title);
  assert.equal(patch.gospel.text, `У той час:\n\n${paragraphs.join('\n')}`);
  assert.equal(proseReadingPatch({ ...source, ...patch }), null);
});

test('Pentecost sequence is extracted without losing a word', () => {
  const reading = 'Браты:\n\nТэкст чытання.';
  const sequence = '1. Божа, Дух Святы\n\nДругая страфа.';
  const patch = structuralReadingPatch({ id: 'feast-pentecost', reading2: { text: `${reading}\n\n${sequence}` } });
  assert.equal(patch.reading2.text, 'Браты:\nТэкст чытання.');
  assert.equal(patch.sequence.text, sequence);
});
