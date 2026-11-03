// Bump after publishing corrections to public Firestore texts/calendar data.
// Deploy this change with the app. Old content remains readable while refreshed.
export const CONTENT_REVISION = '2026-11-03-pr184-first-vespers'; // refresh cached Hours after assembly and Sunday I Vespers fixes

// Change the schema only if stored result shapes are no longer render-compatible.
export const CONTENT_CACHE_SCHEMA = 1;
