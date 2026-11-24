# Google Analytics for Firebase — Web

The Firebase SDK integration and consent lifecycle tests are retained as
dormant engineering preparation. The live Web application does not initialize
Google Analytics: there is no startup prompt and no analytics setting.

The Hosting workflow keeps VITE_FIREBASE_ANALYTICS explicitly false, regardless
of the repository variables. The existing measurement ID is retained. The local
and Cloudflare analytics paths are not changed by this release.

A fresh Web launch clears the previous v2 choice, which also notifies older
same-origin tabs if storage is available. Reload older Web/PWA tabs to apply
the new build. This is not a remote kill switch for stale/offline clients.

Before any future activation, review the applicable legal and Google policy
requirements, establish a valid collection/withdrawal mechanism, update the
privacy notice and verify actual SDK requests with synthetic traffic. Never
enable silent collection merely because the UI was removed. Re-check that
sensitive prayer titles, routes, search terms and IDs are absent in requests.

The existing SDK unit tests remain available with
node --test tests/google-analytics.test.mjs. Normal CI also checks that the
Web app no longer initializes Google Analytics.
