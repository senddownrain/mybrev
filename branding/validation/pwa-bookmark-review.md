# PWA bookmark — design review

Status: **READY FOR DESIGN REVIEW**. No merge or deployment.

Base: `origin/main` at `b03bdbe2b8c89225db58a904fccdd789e0df2f91`, fetched
on 2026-10-16. Branch: `codex/pwa-liturgical-bookmark`.

Approved source SHA256:
`fa8ac6990b67f4a48e5907d00c86aa7306fb44921f079dd5bc92c7bba682a294`.
The canonical source bytes and monochrome SVG are unchanged.

## Visual result

- [Comparison sheet](pwa-bookmark-comparison.png): actual 1024/180/60/48/32 px
  exports, plus circle/rounded Android mask previews on light/dark surfaces.
- [PWA 512](../../public/web-app-manifest-512x512.png).
- [PWA 60](pwa-60.png).
- Editable layer: [pwa-bookmark.svg](../source/pwa-bookmark.svg).

One matte `#9B302A` ribbon emerges from the lower outer edge of the right
page block. The top follows the page curve; a dark fold and a restrained
lighter seam give the cloth depth without gradients or gloss. The ribbon
crosses the cover and ends in a V cut. Pixel comparison against the previous
master confines all 2382 changed pixels (0.23%) to `(751, 737)–(796, 819)`.
The dove, eye, cross, text, rays and surrounding composition are unchanged.

At 60/48 px the burgundy accent is subtle but visible; the V cut itself is
not reliably resolved. This is the main point for owner design review.
The 16/32 px favicons remain byte-identical and monochrome to avoid red noise.
Mask previews are simulations; Android/iOS device acceptance is outstanding.

## Verification

- `python scripts/generate_brand_assets.py --target web` — passed.
- `python scripts/validate_brand_assets.py` — passed: source/overlay hashes,
  inventory, PNG sizes/opacity, menu alpha, ICO frame equality, flat ivory
  outside maskable radius 40%, protected master pixels, micro favicons,
  byte-identical regeneration of all assets and comparison sheet.
- `node --test tests/appearance.test.mjs tests/liturgical-theme.test.mjs` —
  10 passed, 0 failed.
- `npm run build` — passed, including service-worker generation; existing
  large-chunk warnings remain. Local log: `bookmark-build.log` (ignored).
- `node scripts/smoke_brand_install.mjs` — passed in an isolated Chrome
  profile: built icon HTTP bytes and manifest identity matched; installed
  and launched standalone; menu logo verified in light/dark; no page errors.
  23 remote requests were blocked. The initial sandboxed attempt timed out
  waiting for the service worker; the repeat with system application
  registration access passed without changing application or smoke code.
- `git diff --check` — passed.

Local runtime evidence (ignored, captured 2026-10-16):
`pwa-install.json`, `pwa-installed-light.png`, `pwa-installed-dark.png`,
`bookmark-smoke.log`, `bookmark-build.log`. An earlier exploratory
`bookmark-prototype.png` is ignored and is not the final design.

Only the brand layer, generator, validator, exported icon bytes, inventory
and review documentation change. PWA identity, names, manifest settings,
service-worker strategy, application UI code, liturgical colours, Firebase
and content data are untouched. No Flutter files or repository were changed.
