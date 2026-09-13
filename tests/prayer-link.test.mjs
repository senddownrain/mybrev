import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePrayerLink, prayerLinkMarkdown } from '../src/utils/prayerLink.js';
import { renderPrayerMarkdown, autoFixPrayerMarkdown } from '../src/utils/prayerMarkdown.js';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { ensureSyntaxTree } from '@codemirror/language';

test('prayer links are relative and survive rendering and autofix', () => {
  const md = prayerLinkMarkdown('sqIqIfB7tQbom08IPu0t', 'Літанія');
  assert.equal(md, '[Літанія](/prayer/sqIqIfB7tQbom08IPu0t)');
  assert.match(renderPrayerMarkdown(md), /href="\/prayer\/sqIqIfB7tQbom08IPu0t"/);
  assert.equal(autoFixPrayerMarkdown(md).markdown, md);
});

test('existing prayer links recover their ID and literal label for editing', () => {
  const label = '**Малітва** [назва] \\ тэкст';
  assert.deepEqual(parsePrayerLink(prayerLinkMarkdown('a(b)', label)), { id: 'a(b)', label });
  assert.equal(parsePrayerLink('[Сайт](https://example.com/prayer/a)'), null);
  assert.equal(parsePrayerLink('[Тэкст](/prayer/%ZZ)'), null);
});

test('editor syntax identifies the full link, not links written inside code or images', () => {
  const link = prayerLinkMarkdown('target', 'Малітва');
  const source = `Перад ${link} пасля\n\n\`${link}\`\n\n!${link}`;
  const state = EditorState.create({ doc: source, extensions: [markdown()] });
  const links = [];
  ensureSyntaxTree(state, source.length, 1000).iterate({
    enter(node) {
      if (node.name === 'Link') links.push({ from: node.from, to: node.to });
    },
  });
  assert.deepEqual(links, [{ from: 6, to: 6 + link.length }]);
  const { from, to } = links[0];
  const updated = source.slice(0, from) + prayerLinkMarkdown('new-target', 'Новая') + source.slice(to);
  assert.ok(updated.startsWith('Перад [Новая](/prayer/new-target) пасля'));
});

test('link labels remain literal text, including Markdown punctuation', () => {
  const md = prayerLinkMarkdown('a/b', '**Малітва** [назва]\nдругая');
  const html = renderPrayerMarkdown(md);
  assert.match(html, /href="\/prayer\/a%2Fb"/);
  assert.match(html, /\*\*Малітва\*\* \[назва\] другая<\/a>/);
  assert.doesNotMatch(html, /<strong>/);
  assert.throws(() => prayerLinkMarkdown('', 'Назва'));
  assert.equal(prayerLinkMarkdown('a(b)', 'Назва'), '[Назва](/prayer/a%28b%29)');
});
