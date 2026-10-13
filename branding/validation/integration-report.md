# Web brand integration — 2026-10-13

Base main: `b816ad28b07471e5dc74acaa6ad279ec4a6afbf8`.
Source branch: `64b25742929abf22aae2782426b6bbb9adda88d0`.
Only branding resources/tools were selected; the source branch was not merged.
The three existing text files have only favicon links, drawer image src and
the additional 192 maskable entry changed. No content, Firebase rules/functions,
admin logic, routing, calendar, application palette or root dependencies changed.
Owner attachments remain untracked and untouched.

Canonical source SHA256:
`fa8ac6990b67f4a48e5907d00c86aa7306fb44921f079dd5bc92c7bba682a294`.
Matches the source recorded by merged Flutter PR #11
(`0a1457e52ed25bdaea070af86cd8932d731bb144`).

Passed locally:

- `npm ci --no-audit --no-fund` (744 packages).
- `npm run build`, including SW generation: 147 entries / 6458.21 KiB.
  Existing large-chunk warning remains.
- 10 appearance/liturgical-theme tests.
- ESLint for the changed JavaScript/Vue files, without autofix.
- ESLint for all Git-tracked JavaScript/Vue files, without autofix.
- 11 PNG dimensions, opaque RGB install icons, SHA256 inventory, both maskable
  safe zones (every pixel outside radius 40% is ivory), exact ICO 16/32/48/96
  frames, unchanged inventory after regeneration with pinned Pillow/resvg.
- Chrome isolated-profile PWA install and standalone launch; manifest name,
  start_url `.`, scope `/`, no new id, colours and four icons; exact HTTP bytes
  for all manifest icons, favicons, Apple touch and drawer brand.
- Light/dark drawer logo visible after the opening transition; screenshots
  visually inspected. No page errors. 23 external requests blocked by routing;
  DNS restrictions also cover service workers. No Firestore data reads.

The broad local `eslint .` scan also visits ignored backup/cache files and reports
errors there; it is not a clean-checkout CI result. Temporary logs/profiles and
screenshots are ignored, not committed. See the PR CI for clean-checkout status.

Hosting target confirmed by `.firebaserc` and `firebase hosting:sites:list
--project ibreviaryby`: the sole site is `https://ibreviaryby.web.app`.
Merge, post-merge rebuild/smoke and Hosting deployment follow successful PR CI;
their final outcome is reported in the task, not claimed by this pre-PR report.

Unverified: physical Android/iOS installation and OS launcher refresh for older
PWA installations. Existing icons may update with browser/OS delay.
Full integration file list: `integration-files.txt`.
