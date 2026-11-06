import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const vite = readFileSync(new URL('../vite.config.js', import.meta.url), 'utf8')

test('browser favicon uses the approved full-colour art instead of the old brown micro icon', () => {
  const faviconLinks = [...html.matchAll(/<link\s+rel="icon"[^>]*>/g)].map(match => match[0])
  assert.equal(faviconLinks.length, 2, 'Do not reintroduce the old ICO or monochrome micro favicons')
  for (const size of [48, 96]) {
    assert.ok(
      faviconLinks.some(link => link.includes(`sizes="${size}x${size}"`) &&
        link.includes(`/favicon-${size}x${size}.png?v=20261106-color`)),
      `approved coloured favicon ${size}x${size} must be declared with cache-busting URL`
    )
  }
  assert.doesNotMatch(html, /href="\/favicon-(?:16x16|32x32)\.png"/)
  assert.doesNotMatch(html, /rel="icon"[^>]*favicon\.ico/)
})

test('installed PWA icon URLs change while installation identity and manifest path stay stable', () => {
  assert.match(vite, /manifestFilename:\s*'manifest\.webmanifest'/)
  assert.match(vite, /start_url:\s*'\.'/)
  assert.doesNotMatch(vite, /\bid:\s*['"]/)
  for (const filename of [
    'web-app-manifest-192x192.png',
    'web-app-manifest-512x512.png',
    'web-app-manifest-maskable-192x192.png',
    'web-app-manifest-maskable-512x512.png',
  ]) {
    assert.ok(vite.includes(`src: '${filename}?v=20261106-color'`), `missing cache-busted URL: ${filename}`)
  }
})
