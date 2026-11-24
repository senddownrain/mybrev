# Google Analytics for Firebase — Web

Independent of the existing local/Cloudflare analytics. No new Firestore writes.

## Production configuration

The Hosting workflow reads VITE_FIREBASE_MEASUREMENT_ID from repository Variables.
VITE_FIREBASE_ANALYTICS and VITE_FIREBASE_ANALYTICS_RELEASE_APPROVED must both
be true to make the optional feature available. Do not remove the approval gate.
A variable change requires a fresh Hosting build to take effect.

## User choice

No startup prompt, overlay or entry in the ordinary application Settings.
The public privacy notice links to /privacy/analytics, the dedicated page
where users can voluntarily grant or withdraw permission. The existing v2
choice is preserved. Users who previously granted permission continue to
be measured in enabled builds. New users are not tracked before opting in.
Revocation disables collection and syncs across same-origin open tabs.
The privacy page stays readable without JavaScript. Cloudflare is unchanged.

## Release checks

Before approval, verify GA stream settings (Enhanced Measurement, Google signals,
user-provided data and ad personalization off), review applicable privacy and
Google policies, and inspect real SDK requests with synthetic traffic. Verify
no sensitive prayer titles, routes, search terms, account/access IDs or referrers
are sent. Check no tag/cookies/requests before consent, grant and revoke from
the dedicated page, cross-tab behavior, direct links, navigation, and PWA.
Confirm Realtime/DebugView. If payload safety cannot be demonstrated, keep the
release gate off. Mock tests cannot prove network behavior.

Run node --test tests/google-analytics.test.mjs tests/privacy-policy.test.mjs.
Changing the build flag is not an instant remote kill switch for old tabs.
