# First-click responsiveness: reproducible diagnostics (draft)

## Symptom

Immediately after MyBrev opens on a desktop browser, the hamburger menu, a drawer
navigation item, or an already-visible Liturgy of the Hours day card sometimes
does not react to the first click. The issue is intermittent.

**Do not fix code based on guesses. First record concrete failed interactions.**
This branch contains only a read-only diagnostic script; no application runtime,
Firestore rules, production environment, or deploy workflow is changed.

## Why existing benchmarks do not capture this

- \`scripts/benchmark-routes.mjs\` measures time until a content selector becomes
  ready; it does not click at the earliest visible opportunity.
- \`scripts/smoke-ui.mjs\` uses \`locator.click()\`. Playwright waits for an element
  to become actionable before clicking, masking a temporary overlay, \`inert\`,
  \`pointer-events: none\`, or a busy main thread.

The new script uses \`page.mouse.click(x, y)\` at the first visible moment
without any Playwright actionability wait.

## Run

Install project dependencies using \`npm ci\`. Use Chromium installed on the
machine, or install a Playwright-compatible Chromium. The diagnostic needs a
browser that can actually start in the environment; merely having \`chromium\`
on the disk is not sufficient.

Prefer a local preview with a locally seeded Firestore emulator/snapshot:

\`\`\`bash
FIRST_CLICK_BASE_URL=http://127.0.0.1:4173 \
FIRST_CLICK_BROWSER_PATH=/usr/bin/chromium \
FIRST_CLICK_RUNS=8 \
node scripts/diagnose-first-interactions.mjs
\`\`\`

Build/serve the existing project separately, e.g. \`npm run build\` then
\`npm run preview -- --host 127.0.0.1\`. Configure it to use a local emulator
and existing local fixture data; never use production credentials simply to
make a benchmark work. If local data is missing, state that the day-card
scenario is blocked rather than silently using production.

A remote read-only smoke check requires **explicit opt-in**:

\`\`\`bash
FIRST_CLICK_BASE_URL="https://VERIFIED-DEPLOYMENT-URL" \
FIRST_CLICK_ALLOW_REMOTE=yes \
FIRST_CLICK_RUNS=2 \
node scripts/diagnose-first-interactions.mjs
\`\`\`

This deliberately caps remote testing at two repetitions per case/mode; each
page load can cause production **reads**, even though this script never writes.
Do not run remote tests repeatedly if Firestore quota or service health is
already in question. Do not test an authenticated admin account.

Optional: \`FIRST_CLICK_MODES=cold,warm,slow\`,
\`FIRST_CLICK_TIMEOUT_MS=12000\`, \`BENCHMARK_BROWSER_PATH=...\`.

## What is measured

The script runs two cases in three modes on desktop (1366 × 820):

- Menu: first visible hamburger button → drawer visibly opens → immediately
  click the drawer's "Чытанні" link → URL becomes \`/readings\`.
- Day card: first visible \`.day-options-list .day-option\` → URL becomes an
  \`/day/.../ora/...\` route.
- Cold: isolated browser context; warm: reload in the same context; slow:
  4× CPU slowdown and 180 ms network latency.

Each attempt records time since navigation when the button first becomes
visible, raw-click timestamp, click-to-response delay, success/failure,
\`elementFromPoint\` hit-test result, \`pointer-events\`, ancestor \`inert\`,
active overlay candidates, long tasks, uncaught page errors, failed request
hosts, and request count.

Reports: \`reports/performance/first-interactions-<timestamp>.json\`.
No credentials, cookies, prayer text, or response bodies are intentionally
collected. Scrutinize all diagnostic reports before sharing outside the team.

## How to interpret

- **Failed first click but no browser error**: compare the hit-test,
  \`inert\`, overlay and captured \`pointerdown\`/\`click\` with successful attempts.
- **Long tasks overlapping attempted clicks**: inspect Performance traces,
  startup JavaScript and cache/prayer-data initialization.
- **Day card fails but menu works**: investigate loading class
  \`.day-options-list--loading\` with \`pointer-events: none\`.
- **Menu opens but drawer item fails**: investigate navigation drawer transition,
  focus/inert management and the first click on its link.
- **Only warm reload fails**: investigate service worker, IndexedDB,
  stale bundles/cache and cross-tab lifecycle.
- **No failures**: report the distribution including max/P95 and do not claim
  that the intermittent bug is fixed. Add short real-device telemetry only
  if necessary, with privacy review and explicit permission before deployment.

## Acceptance for a follow-up fixing PR

1. Document a reproducible failing scenario, or clearly document that none
   was reproduced and the limitations.
2. Fix only the measured root cause. Never disable legitimate loading safety
   just to make a test green.
3. Rerun the diagnostic before and after with the same device, conditions,
   backend data, and test counts.
4. Confirm immediate menu/day selection, Back, offline PWA, and cache behavior.
5. Keep all application, Firestore and hosting production state unchanged
   until a separate explicit authorization to merge and deploy.
