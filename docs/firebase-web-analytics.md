# Google Analytics for Firebase — Web

Independent of local/Cloudflare analytics. Uses the installed Firebase JS SDK;
does not add Firestore writes.

## Production build settings

The Hosting workflow reads public repository variables:
- VITE_FIREBASE_MEASUREMENT_ID: GA Web measurement ID (G-...).
- VITE_FIREBASE_ANALYTICS: true to request the feature.
- VITE_FIREBASE_ANALYTICS_RELEASE_APPROVED: true ONLY after synthetic QA and privacy review.

Both flags must be true for the SDK to be available in a production build.
Changing a repository variable alone does not rebuild or deploy the app.
Without both flags the feature stays off. The existing Cloudflare flag is unchanged.

## User choice

The non-modal Belarusian prompt and Settings > Статыстыка выкарыстання
use a shared local choice. No analytics SDK initialization before explicit
opt-in. A new v2 localStorage key avoids reusing previous QA-only consent.
Declining leaves the app usable; revocation disables collection and advertising
consent, and synchronizes other same-origin open tabs through storage events.
A missing stream ID or unsupported browser fails closed.

The code requests only a generic page_view and default generic page metadata;
GA SDK automatic events may still be generated. No prayer-level custom events.
No assurance about real SDK network payloads until browser QA is complete.

## Required QA before release approval

Use a separate test stream or synthetic test traffic in a local build.
1. Confirm the Firebase app config and GA web stream measurement ID match.
2. Keep Enhanced Measurement, Google signals, user-provided data collection,
   and advertising personalization off. Review data retention and access.
3. Build locally with VITE_FIREBASE_ANALYTICS=true and test measurement ID.
4. In a fresh browser: verify no Analytics SDK/tag/cookies/requests before
   choice; decline and reload; grant via Settings; confirm Realtime/DebugView.
5. Inspect actual requests (including SDK automatic events) on direct links,
   SPA navigation, search, and private routes. No sensitive page title, route,
   referrer, prayer IDs, access code, account ID or search text may be sent.
   If this cannot be demonstrated, keep the feature disabled.
6. Revoke in Settings, inspect network, test other same-origin open tabs,
   reload and re-grant. Test unsupported browsers, blockers, and offline launch.
7. Check accessibility and mobile/PWA layouts and privacy notice; review
   applicable legal requirements and Google policies before enabling.
8. Only then set VITE_FIREBASE_ANALYTICS_RELEASE_APPROVED=true and publish
   an approved Hosting release. Review workflow impact before manual dispatch:
   the existing workflow may also deploy Firestore rules.
9. Verify Realtime and disable the feature if unexpected payloads appear.
   A build-time rollback needs a fresh Hosting release; existing tabs may
   need to reload. Do not treat it as a real-time remote kill switch.

Unit tests: node --test tests/google-analytics.test.mjs.
Run normal CI and real browser QA; mocked tests do not prove network behavior.
